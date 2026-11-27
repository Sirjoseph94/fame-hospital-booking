-- =========================================================================
-- Clinic sessions (first come, first served)
-- Runs after 20261127000000_account_deletion.sql.
--
-- FAME runs clinic sessions: a doctor sees up to N patients between two
-- times, in arrival order. This replaces fixed 1-patient time slots:
--
--   * clinic_sessions: one row per doctor per session (date, times, capacity).
--     Created in bulk by create_clinic_sessions (one date, or weekly for N
--     weeks). Cancelled/removed by cancel_clinic_session.
--   * Booking (book_session) reserves a place instantly (status 'confirmed',
--     no hold, no doctor approval). Capacity is enforced under a row lock on
--     the session, so the last place can't be sold twice.
--   * move_session_booking moves a booking to another session of the same
--     doctor. Cancelling uses the existing cancel_appointment.
--   * clinic_session_availability exposes booked/places-left counts (patients
--     cannot read other patients' appointments, so they can't count them).
--
-- appointment_slots, slot_holds and blackout_rules are left in place but no
-- longer used by the app; a later migration can drop them.
--
-- Idempotent: safe to re-run.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. Hospital clock. Session times are local wall-clock times; the database
--    runs in UTC. Set this to the hospital's IANA zone (e.g. 'Africa/Lagos').
-- -------------------------------------------------------------------------
alter table public.hospital_settings
  add column if not exists time_zone text not null default 'UTC';

create or replace function public.hospital_now()
returns timestamp
language sql
stable
security definer
set search_path = public
as $$
  select now() at time zone coalesce(
    (select s.time_zone from public.hospital_settings s where s.id = 1),
    'UTC'
  );
$$;

revoke execute on function public.hospital_now() from public, anon;
grant execute on function public.hospital_now() to authenticated;

-- -------------------------------------------------------------------------
-- 2. Sessions
-- -------------------------------------------------------------------------
create table if not exists public.clinic_sessions (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references public.doctors(id) on delete cascade,
  session_date date not null,
  start_time time not null,
  end_time time not null,
  capacity int not null,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'cancelled')),
  cancel_reason text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint clinic_sessions_time_order check (end_time > start_time),
  constraint clinic_sessions_capacity check (capacity between 1 and 200)
);

create index if not exists clinic_sessions_doctor_date_idx
  on public.clinic_sessions (doctor_id, session_date, start_time);
create index if not exists clinic_sessions_date_idx
  on public.clinic_sessions (session_date, status);

alter table public.clinic_sessions enable row level security;

-- Anyone signed in may read sessions (times and capacity aren't sensitive).
-- No write policies: all writes go through the RPCs below.
drop policy if exists "Signed-in users read sessions" on public.clinic_sessions;
create policy "Signed-in users read sessions"
  on public.clinic_sessions for select to authenticated
  using (true);

drop policy if exists "Active accounts only" on public.clinic_sessions;
create policy "Active accounts only" on public.clinic_sessions
  as restrictive for all to authenticated
  using ((select public.is_active_user()))
  with check ((select public.is_active_user()));

revoke all on public.clinic_sessions from anon;
revoke insert, update, delete on public.clinic_sessions from authenticated;
grant select on public.clinic_sessions to authenticated;

-- -------------------------------------------------------------------------
-- 3. Appointments link to a session
-- -------------------------------------------------------------------------
alter table public.appointments
  add column if not exists session_id uuid references public.clinic_sessions(id);

create index if not exists appointments_session_idx
  on public.appointments (session_id)
  where session_id is not null;

-- One live booking per person per session.
create unique index if not exists appointments_one_per_session_beneficiary
  on public.appointments (session_id, beneficiary_id)
  where session_id is not null and status <> 'cancelled';

-- -------------------------------------------------------------------------
-- 4. Availability (counts across all patients' bookings)
--    Not security_invoker: it must count appointments the caller can't read.
--    It only exposes counts, and returns nothing to deactivated accounts.
-- -------------------------------------------------------------------------
create or replace view public.clinic_session_availability as
select
  s.id as session_id,
  s.doctor_id,
  s.session_date,
  s.start_time,
  s.end_time,
  s.capacity,
  s.status,
  s.cancel_reason,
  coalesce(b.booked, 0)::int as booked_count,
  greatest(s.capacity - coalesce(b.booked, 0), 0)::int as places_left,
  (
    s.status = 'scheduled'
    and (s.session_date + s.end_time) > public.hospital_now()
    and coalesce(b.booked, 0) < s.capacity
  ) as is_bookable
from public.clinic_sessions s
left join lateral (
  select count(*) as booked
  from public.appointments a
  where a.session_id = s.id and a.status <> 'cancelled'
) b on true
where (select public.is_active_user());

revoke all on public.clinic_session_availability from public, anon;
grant select on public.clinic_session_availability to authenticated;

-- Earliest bookable session per doctor (doctor list "next session").
create or replace view public.doctor_next_open_session as
select distinct on (v.doctor_id)
  v.doctor_id,
  v.session_id,
  v.session_date,
  v.start_time,
  v.end_time,
  v.places_left
from public.clinic_session_availability v
where v.is_bookable
order by v.doctor_id, v.session_date, v.start_time;

revoke all on public.doctor_next_open_session from public, anon;
grant select on public.doctor_next_open_session to authenticated;

-- -------------------------------------------------------------------------
-- 5. Notifications: a session booking is confirmed on insert; doctors are not
--    messaged per patient for sessions (they'd get one per booking).
-- -------------------------------------------------------------------------
create or replace function public.enqueue_appointment_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_patient uuid;
  v_rescheduled boolean;
  v_notify_doctor boolean;
begin
  v_notify_doctor := new.session_id is null;

  if tg_op = 'INSERT' then
    v_patient := public.appointment_patient_recipient(new);
    if new.status = 'pending' then
      perform public.enqueue_notification_deliveries(
        new.id, new.doctor_id, 'booking_pending_doctor'
      );
      perform public.enqueue_notification_deliveries(
        new.id, v_patient, 'booking_pending_patient'
      );
    elsif new.status = 'confirmed' and new.session_id is not null then
      perform public.enqueue_notification_deliveries(
        new.id, v_patient, 'visit_booked'
      );
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    v_patient := public.appointment_patient_recipient(new);

    if old.status is distinct from new.status then
      if new.status = 'confirmed' then
        perform public.enqueue_notification_deliveries(
          new.id, v_patient, 'visit_confirmed'
        );
      elsif new.status = 'cancelled' then
        perform public.enqueue_notification_deliveries(
          new.id, v_patient, 'visit_cancelled'
        );
        if v_notify_doctor then
          perform public.enqueue_notification_deliveries(
            new.id, new.doctor_id, 'visit_cancelled'
          );
        end if;
      elsif new.status = 'completed' then
        perform public.enqueue_notification_deliveries(
          new.id, v_patient, 'visit_completed'
        );
      end if;
    end if;

    if new.status <> 'cancelled' then
      v_rescheduled :=
        old.appointment_date is distinct from new.appointment_date
        or old.start_time is distinct from new.start_time
        or old.slot_id is distinct from new.slot_id
        or old.session_id is distinct from new.session_id;

      if v_rescheduled
        and not (
          old.status is distinct from new.status
          and new.status in ('cancelled', 'completed')
        )
      then
        perform public.enqueue_notification_deliveries(
          new.id, v_patient, 'visit_rescheduled'
        );
        if v_notify_doctor then
          perform public.enqueue_notification_deliveries(
            new.id, new.doctor_id, 'visit_rescheduled_doctor'
          );
        end if;
      end if;
    end if;

    return new;
  end if;

  return new;
end;
$$;

revoke execute on function public.enqueue_appointment_notifications() from public, anon, authenticated;

-- Session changes go through the RPCs, never direct updates by clients.
create or replace function public.guard_appointment_session()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon')
     and new.session_id is distinct from old.session_id then
    raise exception 'Use the booking service to move a booking.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists appointments_guard_session on public.appointments;
create trigger appointments_guard_session
  before update on public.appointments
  for each row execute function public.guard_appointment_session();

-- -------------------------------------------------------------------------
-- 6. RPCs
-- -------------------------------------------------------------------------

-- Caller may manage this doctor's sessions (the doctor, or an admin).
create or replace function public.can_manage_doctor_sessions(p_doctor_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_role() = 'admin'
      or (public.current_role() = 'doctor' and auth.uid() = p_doctor_id);
$$;

revoke execute on function public.can_manage_doctor_sessions(uuid) from public, anon;
grant execute on function public.can_manage_doctor_sessions(uuid) to authenticated;

-- Create sessions on p_first_date, or weekly on the given weekdays
-- (0 = Sunday … 6 = Saturday) for p_weeks weeks. Dates that already have an
-- overlapping scheduled session, or that have already ended, are skipped.
create or replace function public.create_clinic_sessions(
  p_doctor_id uuid,
  p_first_date date,
  p_weeks int,
  p_weekdays int[],
  p_start_time time,
  p_end_time time,
  p_capacity int
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_now timestamp := public.hospital_now();
  v_date date;
  v_created int := 0;
  v_skipped int := 0;
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'code', 'NOT_AUTHENTICATED');
  end if;
  perform public.assert_active_caller();

  if not public.can_manage_doctor_sessions(p_doctor_id) then
    return jsonb_build_object('success', false, 'code', 'FORBIDDEN');
  end if;
  if not exists (select 1 from public.doctors d where d.id = p_doctor_id) then
    return jsonb_build_object('success', false, 'code', 'NOT_FOUND');
  end if;

  if p_first_date is null or p_start_time is null or p_end_time is null
     or p_weeks is null or p_weeks not between 1 and 26
     or p_capacity is null or p_capacity not between 1 and 200
     or p_end_time <= p_start_time
     or p_weekdays is null or cardinality(p_weekdays) = 0
     or exists (select 1 from unnest(p_weekdays) w where w not between 0 and 6)
     or p_first_date < v_now::date then
    return jsonb_build_object('success', false, 'code', 'INVALID_INPUT');
  end if;

  for v_date in
    select d::date
    from generate_series(
      p_first_date,
      p_first_date + (p_weeks * 7 - 1),
      interval '1 day'
    ) d
    where extract(dow from d)::int = any (p_weekdays)
    order by 1
  loop
    if (v_date + p_end_time) <= v_now
       or exists (
         select 1 from public.clinic_sessions s
         where s.doctor_id = p_doctor_id
           and s.session_date = v_date
           and s.status = 'scheduled'
           and s.start_time < p_end_time
           and s.end_time > p_start_time
       ) then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    insert into public.clinic_sessions (
      doctor_id, session_date, start_time, end_time, capacity, created_by
    )
    values (p_doctor_id, v_date, p_start_time, p_end_time, p_capacity, v_uid);
    v_created := v_created + 1;
  end loop;

  return jsonb_build_object('success', true, 'created', v_created, 'skipped', v_skipped);
end;
$$;

-- Cancel a session: removes it if nobody ever booked it; otherwise marks it
-- cancelled and cancels its live bookings (patients are notified).
create or replace function public.cancel_clinic_session(
  p_session_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_session public.clinic_sessions%rowtype;
  v_cancelled int;
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'code', 'NOT_AUTHENTICATED');
  end if;
  perform public.assert_active_caller();

  select * into v_session from public.clinic_sessions where id = p_session_id for update;
  if not found then
    return jsonb_build_object('success', false, 'code', 'NOT_FOUND');
  end if;
  if not public.can_manage_doctor_sessions(v_session.doctor_id) then
    return jsonb_build_object('success', false, 'code', 'FORBIDDEN');
  end if;
  if v_session.status = 'cancelled'
     or (v_session.session_date + v_session.end_time) <= public.hospital_now() then
    return jsonb_build_object('success', false, 'code', 'NOT_MODIFIABLE');
  end if;

  if not exists (select 1 from public.appointments a where a.session_id = p_session_id) then
    delete from public.clinic_sessions where id = p_session_id;
    return jsonb_build_object('success', true, 'removed', true, 'cancelled_bookings', 0);
  end if;

  update public.clinic_sessions
  set status = 'cancelled',
      cancel_reason = nullif(trim(coalesce(p_reason, '')), '')
  where id = p_session_id;

  update public.appointments
  set status = 'cancelled'
  where session_id = p_session_id and status in ('pending', 'confirmed');
  get diagnostics v_cancelled = row_count;

  return jsonb_build_object('success', true, 'removed', false, 'cancelled_bookings', v_cancelled);
end;
$$;

-- Shared checks for putting a person into a session. Returns an error code,
-- or null when the session can take them. Caller must hold the session lock.
create or replace function public.session_booking_error(
  p_session public.clinic_sessions,
  p_beneficiary_id uuid,
  p_ignore_appointment_id uuid default null
)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_doctor public.doctors%rowtype;
  v_booked int;
begin
  if p_session.id is null
     or p_session.status <> 'scheduled'
     or (p_session.session_date + p_session.end_time) <= public.hospital_now() then
    return 'SESSION_UNAVAILABLE';
  end if;

  select * into v_doctor from public.doctors where id = p_session.doctor_id;
  if not found
     or coalesce(v_doctor.is_active, true) = false
     or v_doctor.is_accepting_bookings = false
     or not coalesce((select p.is_active from public.profiles p where p.id = p_session.doctor_id), false) then
    return 'DOCTOR_UNAVAILABLE';
  end if;

  if exists (
    select 1 from public.appointments a
    where a.session_id = p_session.id
      and a.beneficiary_id = p_beneficiary_id
      and a.status <> 'cancelled'
      and a.id is distinct from p_ignore_appointment_id
  ) then
    return 'ALREADY_BOOKED';
  end if;

  select count(*) into v_booked
  from public.appointments a
  where a.session_id = p_session.id and a.status <> 'cancelled';
  if v_booked >= p_session.capacity then
    return 'SESSION_FULL';
  end if;

  return null;
end;
$$;

revoke execute on function public.session_booking_error(public.clinic_sessions, uuid, uuid) from public, anon, authenticated;

create or replace function public.book_session(
  p_session_id uuid,
  p_beneficiary_id uuid,
  p_reason text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_session public.clinic_sessions%rowtype;
  v_error text;
  v_appt_id uuid;
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'code', 'NOT_AUTHENTICATED');
  end if;
  perform public.assert_active_caller();

  if not exists (
    select 1 from public.beneficiaries b
    where b.id = p_beneficiary_id and b.account_holder_id = v_uid
  ) then
    return jsonb_build_object('success', false, 'code', 'FORBIDDEN');
  end if;

  if char_length(coalesce(p_reason, '')) > 200 or char_length(coalesce(p_notes, '')) > 500 then
    return jsonb_build_object('success', false, 'code', 'INVALID_INPUT');
  end if;

  select * into v_session from public.clinic_sessions where id = p_session_id for update;
  v_error := public.session_booking_error(v_session, p_beneficiary_id);
  if v_error is not null then
    return jsonb_build_object('success', false, 'code', v_error);
  end if;

  insert into public.appointments (
    patient_id, account_holder_id, beneficiary_id, doctor_id, session_id,
    appointment_date, start_time, status, appointment_type, reason, notes
  )
  values (
    v_uid, v_uid, p_beneficiary_id, v_session.doctor_id, p_session_id,
    v_session.session_date, v_session.start_time, 'confirmed', 'in-clinic',
    nullif(trim(p_reason), ''), nullif(trim(p_notes), '')
  )
  returning id into v_appt_id;

  return jsonb_build_object('success', true, 'appointment_id', v_appt_id);
end;
$$;

create or replace function public.move_session_booking(
  p_appointment_id uuid,
  p_new_session_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_appt public.appointments%rowtype;
  v_session public.clinic_sessions%rowtype;
  v_error text;
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
  if v_appt.status not in ('pending', 'confirmed') or v_appt.session_id is null then
    return jsonb_build_object('success', false, 'code', 'NOT_MODIFIABLE');
  end if;
  if v_appt.session_id = p_new_session_id then
    return jsonb_build_object('success', true, 'appointment_id', v_appt.id);
  end if;

  select * into v_session from public.clinic_sessions where id = p_new_session_id for update;
  if found and v_session.doctor_id <> v_appt.doctor_id then
    return jsonb_build_object('success', false, 'code', 'WRONG_DOCTOR');
  end if;
  v_error := public.session_booking_error(v_session, v_appt.beneficiary_id, v_appt.id);
  if v_error is not null then
    return jsonb_build_object('success', false, 'code', v_error);
  end if;

  update public.appointments
  set session_id = p_new_session_id,
      appointment_date = v_session.session_date,
      start_time = v_session.start_time
  where id = p_appointment_id;

  return jsonb_build_object('success', true, 'appointment_id', v_appt.id);
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'create_clinic_sessions(uuid, date, int, int[], time, time, int)',
    'cancel_clinic_session(uuid, text)',
    'book_session(uuid, uuid, text, text)',
    'move_session_booking(uuid, uuid)'
  ]
  loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end;
$$;
