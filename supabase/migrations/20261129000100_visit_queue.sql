-- =========================================================================
-- Arrival check-in, the clinic queue, no-shows and doctor follow-ups
-- Runs after 20261129000000_hospital_info_and_settings.sql.
--
-- Patients are seen in order of arrival:
--   * check_in_visit: the patient scans the QR poster at reception (or types
--     its code); staff can mark a patient arrived without the code. Check-in
--     opens hospital_settings.check_in_opens_minutes before the session and
--     closes when it ends. Each arrival gets the next queue number.
--   * advance_visit / call_next_in_queue: the doctor (or an admin) calls the
--     next patient, marks them done, or records a no-show. Calling a patient
--     pushes "it's your turn" to them and "you're next" to whoever is now
--     first in line.
--   * get_queue_status: a patient's place in line (they can't read other
--     patients' bookings, so the database counts for them).
--   * clinic_session_progress: per-session counts for staff (booked,
--     waiting, with the doctor, seen, no-show).
--   * book_follow_up: a doctor books a patient into one of their future
--     sessions (patients are told). Not limited by the booking window or the
--     doctor's "accepting bookings" switch.
--   * Booking and moving respect hospital_settings.booking_window_days.
--
-- New appointment status: 'no_show'. New columns record check-in, queue
-- number, when the patient was called and finished, and how the booking was
-- made (patient, waitlist, follow_up).
--
-- Idempotent: safe to re-run.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. Columns and status
-- -------------------------------------------------------------------------
alter table public.appointments add column if not exists checked_in_at timestamptz;
alter table public.appointments add column if not exists queue_number int;
alter table public.appointments add column if not exists called_at timestamptz;
alter table public.appointments add column if not exists finished_at timestamptz;
alter table public.appointments add column if not exists next_notified_at timestamptz;
alter table public.appointments add column if not exists source text not null default 'patient'
  check (source in ('patient', 'waitlist', 'follow_up'));
alter table public.appointments add column if not exists booked_by uuid
  references public.profiles(id) on delete set null;
alter table public.appointments add column if not exists follow_up_of uuid
  references public.appointments(id) on delete set null;
-- Reminder bookkeeping (used by run_visit_housekeeping, next migration).
alter table public.appointments add column if not exists reminder_day_before_at timestamptz;
alter table public.appointments add column if not exists reminder_same_day_at timestamptz;

alter table public.appointments drop constraint if exists appointments_status_check;
alter table public.appointments add constraint appointments_status_check
  check (status in ('pending', 'confirmed', 'cancelled', 'completed', 'no_show'));

create unique index if not exists appointments_session_queue_number
  on public.appointments (session_id, queue_number)
  where queue_number is not null;

-- Finished visits get a timestamp however they finish (RPC or older clients
-- marking a visit complete directly).
create or replace function public.stamp_appointment_finish()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status in ('completed', 'no_show')
     and old.status is distinct from new.status
     and new.finished_at is null then
    new.finished_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists appointments_stamp_finish on public.appointments;
create trigger appointments_stamp_finish
  before update on public.appointments
  for each row execute function public.stamp_appointment_finish();

-- -------------------------------------------------------------------------
-- 2. Direct updates: queue fields only change through the RPCs below
-- -------------------------------------------------------------------------
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
      new.appointment_date, new.start_time, new.appointment_type,
      new.reason, new.address, new.checked_in_at, new.queue_number,
      new.called_at, new.next_notified_at, new.source, new.booked_by,
      new.follow_up_of, new.finished_at, new.reminder_day_before_at,
      new.reminder_same_day_at)
     is distinct from
     (old.patient_id, old.account_holder_id, old.beneficiary_id, old.doctor_id,
      old.appointment_date, old.start_time, old.appointment_type,
      old.reason, old.address, old.checked_in_at, old.queue_number,
      old.called_at, old.next_notified_at, old.source, old.booked_by,
      old.follow_up_of, old.finished_at, old.reminder_day_before_at,
      old.reminder_same_day_at) then
    raise exception 'Use the booking service to change this appointment.' using errcode = '42501';
  end if;

  if new.status is distinct from old.status then
    if old.status in ('cancelled', 'completed', 'no_show') then
      raise exception 'This appointment can no longer be changed.' using errcode = '42501';
    end if;
    if not (
      (old.status = 'pending' and new.status in ('confirmed', 'cancelled'))
      or (old.status = 'confirmed' and new.status in ('completed', 'cancelled'))
    ) then
      raise exception 'Invalid status change from % to %.', old.status, new.status
        using errcode = '42501';
    end if;
    -- Same rule as advance_visit: not before the visit could have happened.
    if new.status = 'completed'
       and old.checked_in_at is null
       and (old.appointment_date + old.start_time) > public.hospital_now() then
      raise exception 'A visit can be marked seen once its session has started.'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function public.guard_appointment_update() from public, anon, authenticated;

-- -------------------------------------------------------------------------
-- 3. Notifications
-- -------------------------------------------------------------------------
-- Selected channels only (queue updates are push-only: an email saying
-- "you're next" arrives too late to help).
create or replace function public.enqueue_notification_channels(
  p_appointment_id uuid,
  p_recipient_id uuid,
  p_event_type text,
  p_channels text[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_recipient_id is null then
    return;
  end if;
  insert into public.notification_deliveries (recipient_id, appointment_id, event_type, channel)
  select p_recipient_id, p_appointment_id, p_event_type, c
  from unnest(p_channels) c
  where c in ('email', 'sms', 'push');
end;
$$;

revoke execute on function public.enqueue_notification_channels(uuid, uuid, text, text[])
  from public, anon, authenticated;

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
        new.id, v_patient,
        case new.source
          when 'waitlist' then 'waitlist_booked'
          when 'follow_up' then 'follow_up_booked'
          else 'visit_booked'
        end
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
      elsif new.status = 'no_show' then
        perform public.enqueue_notification_deliveries(
          new.id, v_patient, 'visit_missed'
        );
      end if;
    end if;

    if new.status <> 'cancelled' then
      v_rescheduled :=
        old.appointment_date is distinct from new.appointment_date
        or old.start_time is distinct from new.start_time
        or old.session_id is distinct from new.session_id;

      if v_rescheduled
        and not (
          old.status is distinct from new.status
          and new.status in ('cancelled', 'completed', 'no_show')
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

-- -------------------------------------------------------------------------
-- 4. Booking window
-- -------------------------------------------------------------------------
create or replace function public.booking_window_end()
returns date
language sql
stable
security definer
set search_path = public
as $$
  select public.hospital_now()::date + coalesce(
    (select s.booking_window_days from public.hospital_settings s where s.id = 1),
    60
  );
$$;

revoke execute on function public.booking_window_end() from public, anon;
grant execute on function public.booking_window_end() to authenticated;

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
  if exists (
    select 1 from public.beneficiaries b
    where b.id = p_beneficiary_id and b.archived_at is not null
  ) then
    return jsonb_build_object('success', false, 'code', 'BENEFICIARY_REMOVED');
  end if;

  if char_length(coalesce(p_reason, '')) > 200 or char_length(coalesce(p_notes, '')) > 500 then
    return jsonb_build_object('success', false, 'code', 'INVALID_INPUT');
  end if;

  select * into v_session from public.clinic_sessions where id = p_session_id for update;
  v_error := public.session_booking_error(v_session, p_beneficiary_id);
  if v_error is not null then
    return jsonb_build_object('success', false, 'code', v_error);
  end if;
  if v_session.session_date > public.booking_window_end() then
    return jsonb_build_object('success', false, 'code', 'OUTSIDE_BOOKING_WINDOW');
  end if;

  insert into public.appointments (
    patient_id, account_holder_id, beneficiary_id, doctor_id, session_id,
    appointment_date, start_time, status, appointment_type, reason, notes,
    source, booked_by
  )
  values (
    v_uid, v_uid, p_beneficiary_id, v_session.doctor_id, p_session_id,
    v_session.session_date, v_session.start_time, 'confirmed', 'in-clinic',
    nullif(trim(p_reason), ''), nullif(trim(p_notes), ''),
    'patient', v_uid
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
  v_is_admin boolean := public.current_role() = 'admin';
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'code', 'NOT_AUTHENTICATED');
  end if;
  perform public.assert_active_caller();

  -- Lock order everywhere: session(s) first (by id), then the appointment.
  -- Cancelling/moving can book someone off the old session's waitlist, which
  -- locks that session too.
  select * into v_appt from public.appointments where id = p_appointment_id;
  if not found then
    return jsonb_build_object('success', false, 'code', 'NOT_FOUND');
  end if;
  perform 1 from public.clinic_sessions s
  where s.id in (v_appt.session_id, p_new_session_id)
  order by s.id
  for update;
  select * into v_appt from public.appointments where id = p_appointment_id for update;
  if public.appointment_manager_for(v_appt, v_uid) is null and not v_is_admin then
    return jsonb_build_object('success', false, 'code', 'FORBIDDEN');
  end if;
  -- Once the patient has arrived, their place in today's queue can't move.
  if v_appt.status not in ('pending', 'confirmed')
     or v_appt.session_id is null
     or v_appt.checked_in_at is not null then
    return jsonb_build_object('success', false, 'code', 'NOT_MODIFIABLE');
  end if;
  if v_appt.session_id = p_new_session_id then
    return jsonb_build_object('success', true, 'appointment_id', v_appt.id);
  end if;

  select * into v_session from public.clinic_sessions where id = p_new_session_id;
  if found and v_session.doctor_id <> v_appt.doctor_id then
    return jsonb_build_object('success', false, 'code', 'WRONG_DOCTOR');
  end if;
  v_error := public.session_booking_error(v_session, v_appt.beneficiary_id, v_appt.id);
  if v_error is not null then
    return jsonb_build_object('success', false, 'code', v_error);
  end if;
  -- Staff may move a booking further out (e.g. when a clinic is cancelled).
  if v_session.session_date > public.booking_window_end()
     and v_appt.doctor_id <> v_uid and not v_is_admin then
    return jsonb_build_object('success', false, 'code', 'OUTSIDE_BOOKING_WINDOW');
  end if;

  update public.appointments
  set session_id = p_new_session_id,
      appointment_date = v_session.session_date,
      start_time = v_session.start_time
  where id = p_appointment_id;

  return jsonb_build_object('success', true, 'appointment_id', v_appt.id);
end;
$$;

-- -------------------------------------------------------------------------
-- 5. Check-in and the queue
-- -------------------------------------------------------------------------
create or replace function public.is_visit_staff(p_appt public.appointments)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_role() = 'admin'
      or (public.current_role() = 'doctor' and auth.uid() = p_appt.doctor_id);
$$;

revoke execute on function public.is_visit_staff(public.appointments) from public, anon, authenticated;

-- Place in line for a waiting patient (1 = next), or null when not waiting.
create or replace function public.queue_position(p_appt public.appointments)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_appt.status <> 'confirmed'
      or p_appt.checked_in_at is null
      or p_appt.called_at is not null then null
    else 1 + (
      select count(*)::int
      from public.appointments a
      where a.session_id = p_appt.session_id
        and a.status = 'confirmed'
        and a.checked_in_at is not null
        and a.called_at is null
        and a.queue_number < p_appt.queue_number
    )
  end;
$$;

revoke execute on function public.queue_position(public.appointments) from public, anon, authenticated;

-- Shared by patient and staff check-in. p_code is required unless the caller
-- is staff for this visit.
create or replace function public.check_in_visit(
  p_appointment_id uuid,
  p_code text default null
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
  v_staff boolean;
  v_now timestamp := public.hospital_now();
  v_opens_minutes int;
  v_number int;
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'code', 'NOT_AUTHENTICATED');
  end if;
  perform public.assert_active_caller();

  select * into v_appt from public.appointments where id = p_appointment_id;
  if not found then
    return jsonb_build_object('success', false, 'code', 'NOT_FOUND');
  end if;
  v_staff := public.is_visit_staff(v_appt);
  if not v_staff and public.appointment_manager_for(v_appt, v_uid) is distinct from 'patient' then
    return jsonb_build_object('success', false, 'code', 'FORBIDDEN');
  end if;
  if v_appt.session_id is null or v_appt.status <> 'confirmed' then
    return jsonb_build_object('success', false, 'code', 'NOT_MODIFIABLE');
  end if;

  -- The session lock serialises queue numbers.
  select * into v_session from public.clinic_sessions where id = v_appt.session_id for update;
  select * into v_appt from public.appointments where id = p_appointment_id for update;
  if v_appt.status <> 'confirmed' then
    return jsonb_build_object('success', false, 'code', 'NOT_MODIFIABLE');
  end if;

  if v_appt.checked_in_at is not null then
    return jsonb_build_object(
      'success', true,
      'already', true,
      'queue_number', v_appt.queue_number,
      'position', public.queue_position(v_appt)
    );
  end if;

  if not v_staff then
    if upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'))
       is distinct from (select c.code from public.check_in_secret c where c.id = 1) then
      return jsonb_build_object('success', false, 'code', 'WRONG_CODE');
    end if;
  end if;

  select coalesce(s.check_in_opens_minutes, 120) into v_opens_minutes
  from public.hospital_settings s where s.id = 1;

  if v_session.status <> 'scheduled' then
    return jsonb_build_object('success', false, 'code', 'SESSION_UNAVAILABLE');
  end if;
  if v_now >= v_session.session_date + v_session.end_time then
    return jsonb_build_object('success', false, 'code', 'CHECK_IN_CLOSED');
  end if;
  if v_now < (v_session.session_date + v_session.start_time)
               - make_interval(mins => coalesce(v_opens_minutes, 120)) then
    return jsonb_build_object(
      'success', false,
      'code', 'CHECK_IN_NOT_OPEN',
      'opens_at', (v_session.session_date + v_session.start_time)
                  - make_interval(mins => coalesce(v_opens_minutes, 120))
    );
  end if;

  select coalesce(max(a.queue_number), 0) + 1 into v_number
  from public.appointments a
  where a.session_id = v_session.id;

  update public.appointments
  set checked_in_at = now(), queue_number = v_number
  where id = p_appointment_id
  returning * into v_appt;

  return jsonb_build_object(
    'success', true,
    'already', false,
    'queue_number', v_number,
    'position', public.queue_position(v_appt)
  );
end;
$$;

-- "You're next" for whoever is first in line, once each, while the doctor is
-- with someone (otherwise they'll simply be called).
create or replace function public.notify_next_in_queue(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next public.appointments%rowtype;
begin
  select * into v_next
  from public.appointments a
  where a.session_id = p_session_id
    and a.status = 'confirmed'
    and a.checked_in_at is not null
    and a.called_at is null
  order by a.queue_number
  limit 1;

  if not found or v_next.next_notified_at is not null then
    return;
  end if;

  update public.appointments set next_notified_at = now() where id = v_next.id;
  perform public.enqueue_notification_channels(
    v_next.id, public.appointment_patient_recipient(v_next), 'queue_next', array['push']
  );
end;
$$;

revoke execute on function public.notify_next_in_queue(uuid) from public, anon, authenticated;

-- Staff actions on one visit:
--   arrive   – mark the patient arrived (no code needed)
--   call     – call the patient in (they must have arrived)
--   complete – the visit is done
--   no_show  – the patient didn't come (only before they're called)
--   requeue  – undo a call made by mistake (back to their place in line)
create or replace function public.advance_visit(
  p_appointment_id uuid,
  p_action text
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
  v_now timestamp := public.hospital_now();
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'code', 'NOT_AUTHENTICATED');
  end if;
  perform public.assert_active_caller();

  if p_action not in ('arrive', 'call', 'complete', 'no_show', 'requeue') then
    return jsonb_build_object('success', false, 'code', 'INVALID_INPUT');
  end if;

  select * into v_appt from public.appointments where id = p_appointment_id;
  if not found then
    return jsonb_build_object('success', false, 'code', 'NOT_FOUND');
  end if;
  if not public.is_visit_staff(v_appt) then
    return jsonb_build_object('success', false, 'code', 'FORBIDDEN');
  end if;

  if p_action = 'arrive' then
    return public.check_in_visit(p_appointment_id, null);
  end if;

  if v_appt.session_id is not null then
    select * into v_session from public.clinic_sessions where id = v_appt.session_id for update;
  end if;
  select * into v_appt from public.appointments where id = p_appointment_id for update;

  if v_appt.status <> 'confirmed' then
    return jsonb_build_object('success', false, 'code', 'NOT_MODIFIABLE');
  end if;

  if p_action = 'call' then
    if v_appt.checked_in_at is null then
      return jsonb_build_object('success', false, 'code', 'NOT_ARRIVED');
    end if;
    if v_appt.called_at is null then
      update public.appointments set called_at = now() where id = v_appt.id;
      perform public.enqueue_notification_channels(
        v_appt.id, public.appointment_patient_recipient(v_appt), 'queue_called', array['push', 'sms']
      );
      perform public.notify_next_in_queue(v_appt.session_id);
    end if;
    return jsonb_build_object('success', true, 'appointment_id', v_appt.id);
  end if;

  if p_action = 'requeue' then
    if v_appt.called_at is null then
      return jsonb_build_object('success', false, 'code', 'NOT_MODIFIABLE');
    end if;
    update public.appointments set called_at = null where id = v_appt.id;
    return jsonb_build_object('success', true, 'appointment_id', v_appt.id);
  end if;

  -- complete / no_show: only once the session has started (or the patient
  -- has checked in, for a doctor who starts early).
  if v_appt.checked_in_at is null
     and v_now < coalesce(v_session.session_date + v_session.start_time,
                          v_appt.appointment_date + v_appt.start_time) then
    return jsonb_build_object('success', false, 'code', 'TOO_EARLY');
  end if;

  if p_action = 'complete' then
    update public.appointments set status = 'completed' where id = v_appt.id;
  else
    if v_appt.called_at is not null then
      return jsonb_build_object('success', false, 'code', 'NOT_MODIFIABLE');
    end if;
    update public.appointments set status = 'no_show' where id = v_appt.id;
  end if;
  if v_appt.session_id is not null then
    perform public.notify_next_in_queue(v_appt.session_id);
  end if;

  return jsonb_build_object('success', true, 'appointment_id', v_appt.id);
end;
$$;

-- Call the first patient in line.
create or replace function public.call_next_in_queue(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_session public.clinic_sessions%rowtype;
  v_next uuid;
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

  select a.id into v_next
  from public.appointments a
  where a.session_id = p_session_id
    and a.status = 'confirmed'
    and a.checked_in_at is not null
    and a.called_at is null
  order by a.queue_number
  limit 1;

  if v_next is null then
    return jsonb_build_object('success', false, 'code', 'QUEUE_EMPTY');
  end if;

  return public.advance_visit(v_next, 'call');
end;
$$;

-- A patient's live queue status (patient, the doctor or an admin).
create or replace function public.get_queue_status(p_appointment_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_appt public.appointments%rowtype;
  v_session public.clinic_sessions%rowtype;
  v_opens_minutes int;
  v_waiting int;
  v_serving int;
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'code', 'NOT_AUTHENTICATED');
  end if;
  perform public.assert_active_caller();

  select * into v_appt from public.appointments where id = p_appointment_id;
  if not found then
    return jsonb_build_object('success', false, 'code', 'NOT_FOUND');
  end if;
  if public.appointment_manager_for(v_appt, v_uid) is null and not public.is_visit_staff(v_appt) then
    return jsonb_build_object('success', false, 'code', 'FORBIDDEN');
  end if;
  if v_appt.session_id is null then
    return jsonb_build_object('success', false, 'code', 'NOT_MODIFIABLE');
  end if;

  select * into v_session from public.clinic_sessions where id = v_appt.session_id;
  select coalesce(s.check_in_opens_minutes, 120) into v_opens_minutes
  from public.hospital_settings s where s.id = 1;

  select count(*)::int into v_waiting
  from public.appointments a
  where a.session_id = v_appt.session_id
    and a.status = 'confirmed'
    and a.checked_in_at is not null
    and a.called_at is null;

  select max(a.queue_number) into v_serving
  from public.appointments a
  where a.session_id = v_appt.session_id
    and a.called_at is not null;

  return jsonb_build_object(
    'success', true,
    'status', v_appt.status,
    'checked_in_at', v_appt.checked_in_at,
    'queue_number', v_appt.queue_number,
    'called_at', v_appt.called_at,
    'position', public.queue_position(v_appt),
    'waiting', v_waiting,
    'now_serving', v_serving,
    'check_in_opens_at', (v_session.session_date + v_session.start_time)
                         - make_interval(mins => coalesce(v_opens_minutes, 120)),
    'session_ends_at', v_session.session_date + v_session.end_time,
    'hospital_now', public.hospital_now()
  );
end;
$$;

-- -------------------------------------------------------------------------
-- 6. Follow-ups booked by the doctor
-- -------------------------------------------------------------------------
create or replace function public.book_follow_up(
  p_appointment_id uuid,
  p_session_id uuid,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_orig public.appointments%rowtype;
  v_session public.clinic_sessions%rowtype;
  v_booked int;
  v_appt_id uuid;
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'code', 'NOT_AUTHENTICATED');
  end if;
  perform public.assert_active_caller();

  select * into v_orig from public.appointments where id = p_appointment_id;
  if not found then
    return jsonb_build_object('success', false, 'code', 'NOT_FOUND');
  end if;
  if not public.is_visit_staff(v_orig) then
    return jsonb_build_object('success', false, 'code', 'FORBIDDEN');
  end if;
  if v_orig.status = 'cancelled' then
    return jsonb_build_object('success', false, 'code', 'NOT_MODIFIABLE');
  end if;
  if char_length(coalesce(p_note, '')) > 200 then
    return jsonb_build_object('success', false, 'code', 'INVALID_INPUT');
  end if;
  if exists (
    select 1 from public.beneficiaries b
    where b.id = v_orig.beneficiary_id and b.archived_at is not null
  ) then
    return jsonb_build_object('success', false, 'code', 'BENEFICIARY_REMOVED');
  end if;

  select * into v_session from public.clinic_sessions where id = p_session_id for update;
  if not found
     or v_session.status <> 'scheduled'
     or (v_session.session_date + v_session.end_time) <= public.hospital_now() then
    return jsonb_build_object('success', false, 'code', 'SESSION_UNAVAILABLE');
  end if;
  if v_session.doctor_id <> v_orig.doctor_id then
    return jsonb_build_object('success', false, 'code', 'WRONG_DOCTOR');
  end if;
  if v_session.id = v_orig.session_id then
    return jsonb_build_object('success', false, 'code', 'ALREADY_BOOKED');
  end if;
  if exists (
    select 1 from public.appointments a
    where a.session_id = v_session.id
      and a.beneficiary_id = v_orig.beneficiary_id
      and a.status <> 'cancelled'
  ) then
    return jsonb_build_object('success', false, 'code', 'ALREADY_BOOKED');
  end if;

  select count(*) into v_booked
  from public.appointments a
  where a.session_id = v_session.id and a.status <> 'cancelled';
  if v_booked >= v_session.capacity then
    return jsonb_build_object('success', false, 'code', 'SESSION_FULL');
  end if;

  insert into public.appointments (
    patient_id, account_holder_id, beneficiary_id, doctor_id, session_id,
    appointment_date, start_time, status, appointment_type, reason,
    source, booked_by, follow_up_of
  )
  values (
    v_orig.patient_id, v_orig.account_holder_id, v_orig.beneficiary_id,
    v_session.doctor_id, v_session.id,
    v_session.session_date, v_session.start_time, 'confirmed', 'in-clinic',
    coalesce(nullif(trim(p_note), ''), 'Follow-up'),
    'follow_up', v_uid, v_orig.id
  )
  returning id into v_appt_id;

  return jsonb_build_object('success', true, 'appointment_id', v_appt_id);
end;
$$;

-- -------------------------------------------------------------------------
-- 7. Cancelling: no-shows are final too
-- -------------------------------------------------------------------------
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

  -- Session first, then the appointment (same order as the queue RPCs; the
  -- waitlist trigger locks the session after a cancellation).
  select * into v_appt from public.appointments where id = p_appointment_id;
  if not found then
    return jsonb_build_object('success', false, 'code', 'NOT_FOUND');
  end if;
  if v_appt.session_id is not null then
    perform 1 from public.clinic_sessions where id = v_appt.session_id for update;
  end if;
  select * into v_appt from public.appointments where id = p_appointment_id for update;

  if public.appointment_manager_for(v_appt, v_uid) is null
     and public.current_role() is distinct from 'admin' then
    return jsonb_build_object('success', false, 'code', 'FORBIDDEN');
  end if;
  if v_appt.status in ('cancelled', 'completed', 'no_show') then
    return jsonb_build_object('success', false, 'code', 'NOT_MODIFIABLE');
  end if;

  -- Session places are a live count, so cancelling frees the place.
  update public.appointments set status = 'cancelled' where id = p_appointment_id;

  return jsonb_build_object('success', true, 'appointment_id', p_appointment_id);
end;
$$;

-- -------------------------------------------------------------------------
-- 8. Staff view: how each session is going
-- -------------------------------------------------------------------------
drop view if exists public.clinic_session_progress;
create view public.clinic_session_progress as
select
  s.id as session_id,
  s.doctor_id,
  s.session_date,
  s.start_time,
  s.end_time,
  s.capacity,
  s.room,
  s.status,
  count(a.id) filter (where a.status <> 'cancelled')::int as booked,
  count(a.id) filter (
    where a.status = 'confirmed' and a.checked_in_at is null
  )::int as not_arrived,
  count(a.id) filter (
    where a.status = 'confirmed' and a.checked_in_at is not null and a.called_at is null
  )::int as waiting,
  count(a.id) filter (
    where a.status = 'confirmed' and a.called_at is not null
  )::int as with_doctor,
  count(a.id) filter (where a.status = 'completed')::int as seen,
  count(a.id) filter (where a.status = 'no_show')::int as no_show,
  count(a.id) filter (where a.status = 'cancelled')::int as cancelled
from public.clinic_sessions s
left join public.appointments a on a.session_id = s.id
where (select public.is_active_user())
  and (select public.current_role()) in ('doctor', 'admin')
group by s.id;

revoke all on public.clinic_session_progress from public, anon;
grant select on public.clinic_session_progress to authenticated;

-- -------------------------------------------------------------------------
-- 9. Grants
-- -------------------------------------------------------------------------
do $$
declare
  f text;
begin
  foreach f in array array[
    'book_session(uuid, uuid, text, text)',
    'move_session_booking(uuid, uuid)',
    'check_in_visit(uuid, text)',
    'advance_visit(uuid, text)',
    'call_next_in_queue(uuid)',
    'get_queue_status(uuid)',
    'book_follow_up(uuid, uuid, text)',
    'cancel_appointment(uuid)'
  ]
  loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end;
$$;
