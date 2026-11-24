-- =========================================================================
-- Enforce account deactivation server-side
-- Runs after 20260921000000_security_hardening.sql.
--
-- Before: profiles.is_active was only checked by the app at sign-in, so a
-- deactivated doctor/admin/patient with a live session (and refresh token)
-- kept full API access.
--
-- Now:
--   * Restrictive RLS policies on every table block deactivated users
--     (restrictive policies AND with the existing permissive ones). They can
--     still read their own profile row so the app can show "deactivated".
--   * SECURITY DEFINER RPCs that bypass RLS call assert_active_caller().
--     book_appointment_from_hold / reschedule_appointment need a fresh hold,
--     which hold_slot_if_available now refuses, so they are covered too.
--
-- Idempotent: safe to re-run.
-- =========================================================================

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.is_active from public.profiles p where p.id = auth.uid()),
    false
  );
$$;

-- Raises for signed-in callers whose account is deactivated. No-op for
-- unauthenticated contexts (cron, service role, SQL editor), which are
-- handled by each function's own checks.
create or replace function public.assert_active_caller()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not public.is_active_user() then
    raise exception 'This account has been deactivated.' using errcode = '42501';
  end if;
end;
$$;

-- -------------------------------------------------------------------------
-- Restrictive policies. `(select ...)` makes Postgres evaluate the check once
-- per statement instead of once per row.
-- -------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'admin_audit_log', 'appointment_slots', 'appointments', 'beneficiaries',
    'blackout_rules', 'doctor_invites', 'doctors', 'hospital_settings',
    'notification_deliveries', 'notification_preferences',
    'push_device_tokens', 'slot_holds'
  ]
  loop
    execute format('drop policy if exists "Active accounts only" on public.%I', t);
    execute format(
      'create policy "Active accounts only" on public.%I as restrictive for all to authenticated using ((select public.is_active_user())) with check ((select public.is_active_user()))',
      t
    );
  end loop;
end;
$$;

-- profiles: deactivated users may still read their own row (the app uses it
-- to explain why sign-in failed) but cannot read others or write anything.
drop policy if exists "Active accounts only (read)" on public.profiles;
create policy "Active accounts only (read)" on public.profiles
  as restrictive for select to authenticated
  using ((select public.is_active_user()) or id = (select auth.uid()));

drop policy if exists "Active accounts only (write)" on public.profiles;
create policy "Active accounts only (write)" on public.profiles
  as restrictive for update to authenticated
  using ((select public.is_active_user()))
  with check ((select public.is_active_user()));

-- -------------------------------------------------------------------------
-- RPCs that bypass RLS: same bodies as 20260921000000, plus the check.
-- -------------------------------------------------------------------------
create or replace function public.hold_slot_if_available(
  p_slot_id uuid,
  p_ttl_seconds int default 300
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_slot public.appointment_slots%rowtype;
  v_hold public.slot_holds%rowtype;
  v_has_hold boolean := false;
  v_expires timestamptz;
  v_ttl int := greatest(60, least(coalesce(p_ttl_seconds, 300), 900));
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'code', 'NOT_AUTHENTICATED');
  end if;

  perform public.assert_active_caller();

  perform public.cleanup_expired_slot_holds();

  select * into v_slot
  from public.appointment_slots
  where id = p_slot_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'code', 'SLOT_TAKEN');
  end if;

  if (v_slot.slot_date + v_slot.start_time) < (now() at time zone current_setting('TimeZone')) then
    return jsonb_build_object('success', false, 'code', 'SLOT_TAKEN');
  end if;

  if v_slot.status in ('booked', 'blackout', 'blocked') then
    return jsonb_build_object('success', false, 'code', 'SLOT_TAKEN');
  end if;

  -- Patients can't hold slots for inactive / not-accepting doctors. The slot's
  -- own doctor and admins are exempt so they can still reschedule visits.
  if v_slot.doctor_id <> v_uid
     and public.current_role() is distinct from 'admin'
     and exists (
       select 1 from public.doctors d
       where d.id = v_slot.doctor_id
         and (coalesce(d.is_active, true) = false or d.is_accepting_bookings = false)
     ) then
    return jsonb_build_object('success', false, 'code', 'SLOT_TAKEN');
  end if;

  select * into v_hold
  from public.slot_holds
  where slot_id = p_slot_id;
  v_has_hold := found;

  if v_slot.status = 'held' then
    if not v_has_hold or v_hold.expires_at <= now() then
      delete from public.slot_holds where slot_id = p_slot_id;
      update public.appointment_slots set status = 'available' where id = p_slot_id;
      v_slot.status := 'available';
      v_has_hold := false;
    elsif v_hold.held_by <> v_uid then
      return jsonb_build_object('success', false, 'code', 'SLOT_TAKEN');
    end if;
  end if;

  -- Release any other hold this user still has (prevents hoarding slots).
  with released as (
    delete from public.slot_holds
    where held_by = v_uid and slot_id <> p_slot_id
    returning slot_id
  )
  update public.appointment_slots s
  set status = 'available'
  from released r
  where s.id = r.slot_id and s.status = 'held';

  v_expires := now() + make_interval(secs => v_ttl);

  insert into public.slot_holds (slot_id, held_by, expires_at)
  values (p_slot_id, v_uid, v_expires)
  on conflict (slot_id) do update
    set held_by = excluded.held_by,
        expires_at = excluded.expires_at;

  update public.appointment_slots
  set status = 'held'
  where id = p_slot_id;

  return jsonb_build_object('success', true, 'expires_at', v_expires);
end;
$$;

create or replace function public.cancel_appointment(p_appointment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_appt public.appointments%rowtype;
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'code', 'NOT_AUTHENTICATED');
  end if;

  perform public.assert_active_caller();

  select * into v_appt from public.appointments where id = p_appointment_id for update;
  if not found then
    return jsonb_build_object('success', false, 'code', 'NOT_FOUND');
  end if;

  if public.appointment_manager_for(v_appt, v_uid) is null
     and public.current_role() is distinct from 'admin' then
    return jsonb_build_object('success', false, 'code', 'FORBIDDEN');
  end if;
  if v_appt.status in ('cancelled', 'completed') then
    return jsonb_build_object('success', false, 'code', 'NOT_MODIFIABLE');
  end if;

  update public.appointments set status = 'cancelled' where id = p_appointment_id;

  if v_appt.slot_id is not null then
    update public.appointment_slots s
    set status = 'available'
    where s.id = v_appt.slot_id
      and s.status = 'booked'
      and not exists (
        select 1 from public.appointments a
        where a.slot_id = v_appt.slot_id and a.status in ('pending', 'confirmed')
      );
  end if;

  return jsonb_build_object('success', true, 'appointment_id', p_appointment_id);
end;
$$;

create or replace function public.claim_doctor_invite(p_code text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.doctor_invites%rowtype;
  v_uid uuid := auth.uid();
  v_email text := lower(trim(coalesce(auth.jwt()->>'email', '')));
begin
  if v_uid is null then
    return json_build_object('success', false, 'message', 'Not authenticated');
  end if;

  perform public.assert_active_caller();

  select * into v_invite
  from public.doctor_invites
  where upper(trim(code)) = upper(trim(p_code))
  limit 1
  for update;

  -- Same message for "no such code" and "code for someone else" so codes
  -- cannot be probed.
  if not found or lower(trim(v_invite.email)) <> v_email then
    return json_build_object(
      'success', false,
      'message', 'Invalid invite code for this account. Sign in with the email address the invite was sent to.'
    );
  end if;

  if v_invite.status <> 'pending' then
    return json_build_object('success', false, 'message', 'Invite code has already been ' || v_invite.status || '.');
  end if;

  if v_invite.expires_at < now() then
    update public.doctor_invites set status = 'expired' where id = v_invite.id;
    return json_build_object('success', false, 'message', 'This invite code has expired.');
  end if;

  update public.profiles
  set role = 'doctor'
  where id = v_uid;

  insert into public.doctors (id, specialty, bio, consultation_fee, years_experience, is_active)
  values (
    v_uid,
    v_invite.specialty,
    v_invite.bio,
    coalesce(v_invite.consultation_fee, 0),
    coalesce(v_invite.years_experience, 0),
    true
  )
  on conflict (id) do update
  set specialty = excluded.specialty,
      bio = excluded.bio,
      consultation_fee = excluded.consultation_fee,
      years_experience = excluded.years_experience,
      is_active = true;

  update public.doctor_invites
  set status = 'accepted',
      accepted_by = v_uid
  where id = v_invite.id;

  return json_build_object('success', true, 'message', 'Doctor profile activated successfully.');
end;
$$;

create or replace function public.free_orphan_booked_slot(p_slot_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'code', 'NOT_AUTHENTICATED');
  end if;

  perform public.assert_active_caller();

  if public.current_role() is distinct from 'admin'
     and not exists (
       select 1 from public.appointment_slots s
       where s.id = p_slot_id and s.doctor_id = v_uid
     ) then
    return jsonb_build_object('success', false, 'code', 'FORBIDDEN');
  end if;

  if exists (
    select 1 from public.appointments a
    where a.slot_id = p_slot_id and a.status in ('pending', 'confirmed')
  ) then
    return jsonb_build_object('success', false, 'code', 'SLOT_IN_USE');
  end if;

  update public.appointment_slots
  set status = 'available'
  where id = p_slot_id and status = 'booked';

  return jsonb_build_object('success', true);
end;
$$;

revoke execute on function public.is_active_user() from public, anon;
grant execute on function public.is_active_user() to authenticated;
revoke execute on function public.assert_active_caller() from public, anon, authenticated;
