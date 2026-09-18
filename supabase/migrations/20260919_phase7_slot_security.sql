-- Phase 7 — post-pilot slot hold security (I-21, I-22) + admin audit log
-- Run after 20260918_blackout_delete_policy.sql

-- ---------------------------------------------------------------------------
-- Admin audit log (invite create/revoke, profile activate/deactivate)
-- ---------------------------------------------------------------------------
create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_log_created_at_idx
  on public.admin_audit_log (created_at desc);

alter table public.admin_audit_log enable row level security;

create policy "Admins read audit log" on public.admin_audit_log
  for select using (public.current_role() = 'admin');

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
  if public.current_role() <> 'admin' then
    return;
  end if;

  insert into public.admin_audit_log (actor_id, action, target_type, target_id, metadata)
  values (auth.uid(), p_action, p_target_type, p_target_id, coalesce(p_metadata, '{}'::jsonb));
end;
$$;

create or replace function public.audit_doctor_invite_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_admin_audit(
      'doctor_invite_created',
      'doctor_invite',
      new.id,
      jsonb_build_object(
        'email', new.email,
        'specialty', new.specialty,
        'code', new.code
      )
    );
  elsif tg_op = 'UPDATE'
    and new.status = 'revoked'
    and old.status is distinct from new.status then
    perform public.log_admin_audit(
      'doctor_invite_revoked',
      'doctor_invite',
      new.id,
      jsonb_build_object('email', new.email, 'code', new.code)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists doctor_invites_admin_audit on public.doctor_invites;
create trigger doctor_invites_admin_audit
  after insert or update on public.doctor_invites
  for each row execute function public.audit_doctor_invite_change();

create or replace function public.audit_profile_active_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.is_active is distinct from new.is_active then
    perform public.log_admin_audit(
      case when new.is_active then 'profile_reactivated' else 'profile_deactivated' end,
      'profile',
      new.id,
      jsonb_build_object('role', new.role, 'is_active', new.is_active)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_admin_audit on public.profiles;
create trigger profiles_admin_audit
  after update of is_active on public.profiles
  for each row execute function public.audit_profile_active_change();

-- ---------------------------------------------------------------------------
-- Slot hold / book RPCs (replace broad patient UPDATE on appointment_slots)
-- ---------------------------------------------------------------------------
create or replace function public.cleanup_expired_slot_holds()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  with expired as (
    select slot_id
    from public.slot_holds
    where expires_at <= now()
  ),
  deleted as (
    delete from public.slot_holds h
    using expired e
    where h.slot_id = e.slot_id
    returning h.slot_id
  )
  update public.appointment_slots s
  set status = 'available'
  from deleted d
  where s.id = d.slot_id
    and s.status = 'held';
end;
$$;

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
  v_start timestamptz;
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

  v_start := (v_slot.slot_date::text || 'T' || v_slot.start_time::text)::timestamptz;
  if v_start < now() then
    return jsonb_build_object('success', false, 'code', 'SLOT_TAKEN');
  end if;

  if v_slot.status in ('booked', 'blackout', 'blocked') then
    return jsonb_build_object('success', false, 'code', 'SLOT_TAKEN');
  end if;

  select * into v_hold
  from public.slot_holds
  where slot_id = p_slot_id;
  v_has_hold := found;

  if v_slot.status = 'held' then
    if not v_has_hold then
      update public.appointment_slots
      set status = 'available'
      where id = p_slot_id;
      v_slot.status := 'available';
    elsif v_hold.expires_at <= now() then
      delete from public.slot_holds where slot_id = p_slot_id;
      update public.appointment_slots
      set status = 'available'
      where id = p_slot_id;
      v_slot.status := 'available';
      v_has_hold := false;
    elsif v_hold.held_by <> v_uid then
      return jsonb_build_object('success', false, 'code', 'SLOT_TAKEN');
    end if;
  end if;

  if v_slot.status = 'available'
     or (
       v_slot.status = 'held'
       and v_has_hold
       and v_hold.held_by = v_uid
       and v_hold.expires_at > now()
     ) then
    v_expires := now() + make_interval(secs => v_ttl);

    insert into public.slot_holds (slot_id, held_by, expires_at)
    values (p_slot_id, v_uid, v_expires)
    on conflict (slot_id) do update
      set held_by = excluded.held_by,
          expires_at = excluded.expires_at;

    update public.appointment_slots
    set status = 'held'
    where id = p_slot_id;

    return jsonb_build_object(
      'success', true,
      'expires_at', v_expires
    );
  end if;

  return jsonb_build_object('success', false, 'code', 'SLOT_TAKEN');
end;
$$;

create or replace function public.release_slot_hold(p_slot_id uuid)
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

  delete from public.slot_holds
  where slot_id = p_slot_id
    and held_by = v_uid;

  update public.appointment_slots
  set status = 'available'
  where id = p_slot_id
    and status = 'held'
    and not exists (
      select 1 from public.slot_holds h where h.slot_id = p_slot_id
    );

  return jsonb_build_object('success', true);
end;
$$;

create or replace function public.book_held_slot(p_slot_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_hold public.slot_holds%rowtype;
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'code', 'NOT_AUTHENTICATED');
  end if;

  select * into v_hold
  from public.slot_holds
  where slot_id = p_slot_id
  for update;

  if not found
     or v_hold.held_by <> v_uid
     or v_hold.expires_at <= now() then
    return jsonb_build_object('success', false, 'code', 'HOLD_EXPIRED');
  end if;

  update public.appointment_slots
  set status = 'booked'
  where id = p_slot_id
    and status = 'held';

  if not found then
    return jsonb_build_object('success', false, 'code', 'SLOT_TAKEN');
  end if;

  delete from public.slot_holds where slot_id = p_slot_id;

  return jsonb_build_object('success', true);
end;
$$;

create or replace function public.free_orphan_booked_slot(p_slot_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return jsonb_build_object('success', false, 'code', 'NOT_AUTHENTICATED');
  end if;

  if exists (
    select 1
    from public.appointments a
    where a.slot_id = p_slot_id
      and a.status in ('pending', 'confirmed')
  ) then
    return jsonb_build_object('success', false, 'code', 'SLOT_IN_USE');
  end if;

  update public.appointment_slots
  set status = 'available'
  where id = p_slot_id
    and status = 'booked';

  return jsonb_build_object('success', true);
end;
$$;

drop policy if exists "Authenticated users update slots for booking"
  on public.appointment_slots;

drop policy if exists "Authenticated users manage own holds" on public.slot_holds;

grant execute on function public.cleanup_expired_slot_holds() to authenticated;
grant execute on function public.hold_slot_if_available(uuid, int) to authenticated;
grant execute on function public.release_slot_hold(uuid) to authenticated;
grant execute on function public.book_held_slot(uuid) to authenticated;
grant execute on function public.free_orphan_booked_slot(uuid) to authenticated;
