-- =========================================================================
-- Security hardening (post-review)
-- Runs after 20260920000000_notifications.sql.
--
-- Fixes:
--   1. Sign-up no longer trusts client-supplied `role` metadata.
--   2. Users cannot change their own `role` / `is_active` (profiles) or
--      `is_active` (doctors).
--   3. Doctor invite codes are no longer readable by every user; claiming
--      requires the invited email and locks the invite row.
--   4. Internal SECURITY DEFINER helpers are no longer callable by clients.
--   5. Booking / reschedule / cancel run as single transactional RPCs.
--      Patients lose direct INSERT/UPDATE on appointments; doctors may only
--      change status/room/video_url on their own appointments.
--   6. One active appointment per slot (partial unique index).
--   7. free_orphan_booked_slot checks ownership.
--   8. log_admin_audit NULL-role bypass fixed.
--   9. One active hold per user (taking a new hold releases the old one);
--      optional pg_cron sweep of expired holds.
--  10. Missing indexes + sanity CHECK constraints.
--  11. notification_deliveries gains a `processing` state + attempt counter
--      so the Edge Function can claim rows atomically.
--
-- Idempotent: safe to re-run.
-- =========================================================================

-- -------------------------------------------------------------------------
-- Pre-flight: refuse to continue if existing data would violate the new
-- one-active-appointment-per-slot rule.
-- -------------------------------------------------------------------------
do $$
declare
  v_dupes int;
begin
  select count(*) into v_dupes
  from (
    select slot_id
    from public.appointments
    where slot_id is not null
      and status in ('pending', 'confirmed')
    group by slot_id
    having count(*) > 1
  ) d;

  if v_dupes > 0 then
    raise exception
      'security_hardening: % slot(s) have more than one active appointment. Resolve them (cancel duplicates) before running this migration. Query: select slot_id, array_agg(id) from public.appointments where status in (''pending'',''confirmed'') and slot_id is not null group by slot_id having count(*) > 1;',
      v_dupes;
  end if;
end;
$$;

-- -------------------------------------------------------------------------
-- 1. Sign-up trigger: role is always 'patient'
-- -------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), 'New User'),
    'patient'
  );
  return new;
end;
$$;

-- Pin search_path on the remaining definer helper from the init migration.
alter function public.current_role() set search_path = public;

-- -------------------------------------------------------------------------
-- 2. Privileged-column guards
--    Client requests run as the `authenticated` (or `anon`) DB role.
--    SECURITY DEFINER functions run as their owner, so RPCs such as
--    claim_doctor_invite are unaffected by these guards.
-- -------------------------------------------------------------------------
create or replace function public.guard_profile_privileged_columns()
returns trigger
language plpgsql
-- SECURITY INVOKER on purpose: current_user must reflect the caller
-- ('authenticated' for client requests, the owner inside definer RPCs).
set search_path = public
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if new.id is distinct from old.id then
    raise exception 'Profile id cannot be changed.' using errcode = '42501';
  end if;

  if (new.role is distinct from old.role
      or new.is_active is distinct from old.is_active)
     and public.current_role() is distinct from 'admin' then
    raise exception 'Only administrators can change role or account status.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_guard_privileged on public.profiles;
create trigger profiles_guard_privileged
  before update on public.profiles
  for each row execute function public.guard_profile_privileged_columns();

-- Belt and braces: the self-update policy now also has a WITH CHECK.
drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile" on public.profiles
  for update using (auth.uid() = id)
  with check (auth.uid() = id);

create or replace function public.guard_doctor_privileged_columns()
returns trigger
language plpgsql
-- SECURITY INVOKER on purpose: current_user must reflect the caller
-- ('authenticated' for client requests, the owner inside definer RPCs).
set search_path = public
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if new.id is distinct from old.id then
    raise exception 'Doctor id cannot be changed.' using errcode = '42501';
  end if;

  if new.is_active is distinct from old.is_active
     and public.current_role() is distinct from 'admin' then
    raise exception 'Only administrators can activate or deactivate doctors.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists doctors_guard_privileged on public.doctors;
create trigger doctors_guard_privileged
  before update on public.doctors
  for each row execute function public.guard_doctor_privileged_columns();

-- -------------------------------------------------------------------------
-- 3. Doctor invites
-- -------------------------------------------------------------------------
drop policy if exists "Anyone authenticated can check invite code"
  on public.doctor_invites;

create index if not exists doctor_invites_code_norm_idx
  on public.doctor_invites (upper(trim(code)));

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

-- -------------------------------------------------------------------------
-- 8. log_admin_audit: NULL role (anon) must not pass the admin check
-- -------------------------------------------------------------------------
create or replace function public.log_admin_audit(
  p_action text,
  p_target_type text,
  p_target_id uuid,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_role() is distinct from 'admin' then
    return;
  end if;

  insert into public.admin_audit_log (actor_id, action, target_type, target_id, metadata)
  values (auth.uid(), p_action, p_target_type, p_target_id, coalesce(p_metadata, '{}'::jsonb));
end;
$$;

-- -------------------------------------------------------------------------
-- 6. One active appointment per slot
-- -------------------------------------------------------------------------
create unique index if not exists appointments_one_active_per_slot
  on public.appointments (slot_id)
  where slot_id is not null and status in ('pending', 'confirmed');

-- -------------------------------------------------------------------------
-- 5. Appointments: lock down direct writes
-- -------------------------------------------------------------------------
drop policy if exists "Patients create own appointments" on public.appointments;
drop policy if exists "Patients cancel own appointments" on public.appointments;

create or replace function public.guard_appointment_update()
returns trigger
language plpgsql
-- SECURITY INVOKER on purpose: current_user must reflect the caller
-- ('authenticated' for client requests, the owner inside definer RPCs).
set search_path = public
as $$
begin
  -- Video links must be https (they are rendered as links in emails / app).
  if new.video_url is not null
     and new.video_url is distinct from old.video_url
     and new.video_url !~* '^https://' then
    raise exception 'Video link must start with https://' using errcode = '22023';
  end if;

  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if public.current_role() = 'admin' then
    return new;
  end if;

  if auth.uid() is distinct from old.doctor_id then
    raise exception 'Appointments can only be changed through the booking service.'
      using errcode = '42501';
  end if;

  -- Doctor on their own appointment: status / room / video_url / notes only.
  if (new.patient_id, new.account_holder_id, new.beneficiary_id, new.doctor_id,
      new.slot_id, new.appointment_date, new.start_time, new.appointment_type,
      new.reason, new.address)
     is distinct from
     (old.patient_id, old.account_holder_id, old.beneficiary_id, old.doctor_id,
      old.slot_id, old.appointment_date, old.start_time, old.appointment_type,
      old.reason, old.address) then
    raise exception 'Use reschedule to move an appointment.' using errcode = '42501';
  end if;

  if new.status is distinct from old.status then
    if old.status in ('cancelled', 'completed') then
      raise exception 'This appointment can no longer be changed.' using errcode = '42501';
    end if;
    if not (
      (old.status = 'pending' and new.status in ('confirmed', 'cancelled'))
      or (old.status = 'confirmed' and new.status in ('completed', 'cancelled'))
    ) then
      raise exception 'Invalid status change from % to %.', old.status, new.status
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists appointments_guard_update on public.appointments;
create trigger appointments_guard_update
  before update on public.appointments
  for each row execute function public.guard_appointment_update();

-- Shared: who may manage an appointment ('doctor' | 'patient' | null)
create or replace function public.appointment_manager_for(
  p_row public.appointments,
  p_uid uuid
)
returns text
language sql
stable
set search_path = public
as $$
  select case
    when p_row.doctor_id = p_uid then 'doctor'
    when p_row.account_holder_id = p_uid or p_row.patient_id = p_uid then 'patient'
    else null
  end;
$$;

-- Book: validate hold + slot + beneficiary, insert appointment, mark slot
-- booked, clear hold — all in one transaction.
create or replace function public.book_appointment_from_hold(
  p_slot_id uuid,
  p_beneficiary_id uuid,
  p_appointment_type text default 'in-clinic',
  p_reason text default null,
  p_notes text default null,
  p_address text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_hold public.slot_holds%rowtype;
  v_slot public.appointment_slots%rowtype;
  v_doctor public.doctors%rowtype;
  v_appt_id uuid;
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'code', 'NOT_AUTHENTICATED');
  end if;

  select * into v_hold from public.slot_holds where slot_id = p_slot_id for update;
  if not found or v_hold.held_by <> v_uid or v_hold.expires_at <= now() then
    return jsonb_build_object('success', false, 'code', 'HOLD_EXPIRED');
  end if;

  select * into v_slot from public.appointment_slots where id = p_slot_id for update;
  if not found
     or v_slot.status <> 'held'
     or (v_slot.slot_date + v_slot.start_time) < (now() at time zone current_setting('TimeZone')) then
    return jsonb_build_object('success', false, 'code', 'SLOT_TAKEN');
  end if;

  select * into v_doctor from public.doctors where id = v_slot.doctor_id;
  if not found
     or coalesce(v_doctor.is_active, true) = false
     or v_doctor.is_accepting_bookings = false then
    return jsonb_build_object('success', false, 'code', 'SLOT_TAKEN');
  end if;

  if not exists (
    select 1 from public.beneficiaries b
    where b.id = p_beneficiary_id and b.account_holder_id = v_uid
  ) then
    return jsonb_build_object('success', false, 'code', 'FORBIDDEN');
  end if;

  if coalesce(p_appointment_type, 'in-clinic') not in ('in-clinic', 'telehealth', 'home-visit') then
    return jsonb_build_object('success', false, 'code', 'INVALID_INPUT');
  end if;

  begin
    insert into public.appointments (
      patient_id, account_holder_id, beneficiary_id, doctor_id, slot_id,
      appointment_date, start_time, status, appointment_type,
      reason, notes, address
    )
    values (
      v_uid, v_uid, p_beneficiary_id, v_slot.doctor_id, p_slot_id,
      v_slot.slot_date, v_slot.start_time, 'pending',
      coalesce(p_appointment_type, 'in-clinic'),
      nullif(trim(p_reason), ''), nullif(trim(p_notes), ''), nullif(trim(p_address), '')
    )
    returning id into v_appt_id;
  exception when unique_violation then
    return jsonb_build_object('success', false, 'code', 'SLOT_TAKEN');
  end;

  update public.appointment_slots set status = 'booked' where id = p_slot_id;
  delete from public.slot_holds where slot_id = p_slot_id;

  return jsonb_build_object('success', true, 'appointment_id', v_appt_id);
end;
$$;

-- Reschedule onto a slot the caller holds.
create or replace function public.reschedule_appointment(
  p_appointment_id uuid,
  p_new_slot_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_appt public.appointments%rowtype;
  v_manager text;
  v_hold public.slot_holds%rowtype;
  v_slot public.appointment_slots%rowtype;
  v_prev_slot uuid;
  v_next_status text;
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'code', 'NOT_AUTHENTICATED');
  end if;

  select * into v_appt from public.appointments where id = p_appointment_id for update;
  if not found then
    return jsonb_build_object('success', false, 'code', 'NOT_FOUND');
  end if;

  v_manager := public.appointment_manager_for(v_appt, v_uid);
  if v_manager is null then
    return jsonb_build_object('success', false, 'code', 'FORBIDDEN');
  end if;
  if v_appt.status in ('cancelled', 'completed') then
    return jsonb_build_object('success', false, 'code', 'NOT_MODIFIABLE');
  end if;

  select * into v_hold from public.slot_holds where slot_id = p_new_slot_id for update;
  if not found or v_hold.held_by <> v_uid or v_hold.expires_at <= now() then
    return jsonb_build_object('success', false, 'code', 'HOLD_EXPIRED');
  end if;

  select * into v_slot from public.appointment_slots where id = p_new_slot_id for update;
  if not found
     or v_slot.status <> 'held'
     or (v_slot.slot_date + v_slot.start_time) < (now() at time zone current_setting('TimeZone')) then
    return jsonb_build_object('success', false, 'code', 'SLOT_TAKEN');
  end if;

  if v_slot.doctor_id <> v_appt.doctor_id then
    return jsonb_build_object('success', false, 'code', 'WRONG_DOCTOR');
  end if;

  v_prev_slot := v_appt.slot_id;
  v_next_status := case
    when v_manager = 'patient' and v_appt.status = 'pending' then 'pending'
    else 'confirmed'
  end;

  begin
    update public.appointments
    set slot_id = p_new_slot_id,
        appointment_date = v_slot.slot_date,
        start_time = v_slot.start_time,
        status = v_next_status
    where id = p_appointment_id;
  exception when unique_violation then
    return jsonb_build_object('success', false, 'code', 'SLOT_TAKEN');
  end;

  update public.appointment_slots set status = 'booked' where id = p_new_slot_id;
  delete from public.slot_holds where slot_id = p_new_slot_id;

  if v_prev_slot is not null and v_prev_slot <> p_new_slot_id then
    update public.appointment_slots s
    set status = 'available'
    where s.id = v_prev_slot
      and s.status = 'booked'
      and not exists (
        select 1 from public.appointments a
        where a.slot_id = v_prev_slot and a.status in ('pending', 'confirmed')
      );
  end if;

  return jsonb_build_object('success', true, 'appointment_id', p_appointment_id);
end;
$$;

-- Cancel (patient/account holder or the appointment's doctor).
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

-- -------------------------------------------------------------------------
-- 7. free_orphan_booked_slot: only the slot's doctor or an admin
-- -------------------------------------------------------------------------
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

-- -------------------------------------------------------------------------
-- 9. Holds: one active hold per user; holds visible only to their owner
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

drop policy if exists "Authenticated users view holds" on public.slot_holds;
drop policy if exists "Users view own holds" on public.slot_holds;
create policy "Users view own holds" on public.slot_holds
  for select using (auth.uid() = held_by);

-- Sweep expired holds every minute when pg_cron is enabled
-- (Dashboard → Database → Extensions → pg_cron). No-op otherwise.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'cleanup-expired-slot-holds',
      '* * * * *',
      'select public.cleanup_expired_slot_holds();'
    );
  else
    raise notice 'pg_cron not enabled: expired slot holds are only swept when a new hold is taken. Enable pg_cron and re-run this migration to schedule a sweep.';
  end if;
end;
$$;

-- -------------------------------------------------------------------------
-- 11. Notification outbox: atomic claim support
-- -------------------------------------------------------------------------
alter table public.notification_deliveries
  add column if not exists attempts int not null default 0;

alter table public.notification_deliveries
  drop constraint if exists notification_deliveries_status_check;
alter table public.notification_deliveries
  add constraint notification_deliveries_status_check
  check (status in ('pending', 'processing', 'sent', 'skipped', 'failed'));

-- -------------------------------------------------------------------------
-- 10. Indexes + sanity checks
-- -------------------------------------------------------------------------
create index if not exists appointments_patient_idx on public.appointments (patient_id);
create index if not exists appointments_account_holder_idx on public.appointments (account_holder_id);
create index if not exists appointments_doctor_date_idx on public.appointments (doctor_id, appointment_date);
create index if not exists appointments_beneficiary_idx on public.appointments (beneficiary_id);
create index if not exists appointments_slot_idx on public.appointments (slot_id);
create index if not exists notification_deliveries_recipient_idx
  on public.notification_deliveries (recipient_id);
create index if not exists slot_holds_held_by_idx on public.slot_holds (held_by);

-- NOT VALID: enforced for new/updated rows without failing on legacy data.
-- Run `alter table ... validate constraint ...` once existing rows are clean.
alter table public.appointment_slots
  drop constraint if exists appointment_slots_time_order_check;
alter table public.appointment_slots
  add constraint appointment_slots_time_order_check
  check (end_time > start_time) not valid;

alter table public.blackout_rules
  drop constraint if exists blackout_rules_time_order_check;
alter table public.blackout_rules
  add constraint blackout_rules_time_order_check
  check (ends_at > starts_at) not valid;

-- -------------------------------------------------------------------------
-- 4. Function execute privileges
--    Postgres grants EXECUTE to PUBLIC by default, and Supabase also grants
--    it to anon/authenticated. Lock internal helpers down and grant the
--    client-facing RPCs to `authenticated` only.
-- -------------------------------------------------------------------------
revoke execute on function public.enqueue_notification_deliveries(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.log_admin_audit(text, text, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.audit_doctor_invite_change() from public, anon, authenticated;
revoke execute on function public.audit_profile_active_change() from public, anon, authenticated;
revoke execute on function public.enqueue_appointment_notifications() from public, anon, authenticated;
revoke execute on function public.guard_profile_privileged_columns() from public, anon, authenticated;
revoke execute on function public.guard_doctor_privileged_columns() from public, anon, authenticated;
revoke execute on function public.guard_appointment_update() from public, anon, authenticated;
revoke execute on function public.appointment_manager_for(public.appointments, uuid) from public, anon, authenticated;

-- Client-facing RPCs: authenticated users only.
revoke execute on function public.cleanup_expired_slot_holds() from public, anon;
revoke execute on function public.hold_slot_if_available(uuid, int) from public, anon;
revoke execute on function public.release_slot_hold(uuid) from public, anon;
revoke execute on function public.book_held_slot(uuid) from public, anon;
revoke execute on function public.free_orphan_booked_slot(uuid) from public, anon;
revoke execute on function public.claim_doctor_invite(text) from public, anon;
revoke execute on function public.book_appointment_from_hold(uuid, uuid, text, text, text, text) from public, anon;
revoke execute on function public.reschedule_appointment(uuid, uuid) from public, anon;
revoke execute on function public.cancel_appointment(uuid) from public, anon;

grant execute on function public.cleanup_expired_slot_holds() to authenticated;
grant execute on function public.hold_slot_if_available(uuid, int) to authenticated;
grant execute on function public.release_slot_hold(uuid) to authenticated;
grant execute on function public.book_held_slot(uuid) to authenticated;
grant execute on function public.free_orphan_booked_slot(uuid) to authenticated;
grant execute on function public.claim_doctor_invite(text) to authenticated;
grant execute on function public.book_appointment_from_hold(uuid, uuid, text, text, text, text) to authenticated;
grant execute on function public.reschedule_appointment(uuid, uuid) to authenticated;
grant execute on function public.cancel_appointment(uuid) to authenticated;
