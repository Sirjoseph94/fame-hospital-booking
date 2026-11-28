-- =========================================================================
-- Remove the retired slot system
-- Runs after 20261128000500_admin_notification_deliveries.sql.
--
-- Booking moved to clinic sessions (20261128000000). This drops what only
-- the old one-patient-per-slot model used:
--
--   * tables appointment_slots, slot_holds, blackout_rules (and their
--     policies, triggers and indexes), view doctor_next_available_slots
--   * RPCs hold_slot_if_available, release_slot_hold, book_held_slot,
--     free_orphan_booked_slot, cleanup_expired_slot_holds,
--     book_appointment_from_hold, reschedule_appointment
--   * the pg_cron job that swept expired holds
--   * appointments.slot_id and hospital_settings.buffer_minutes
--
-- cancel_appointment, delete_my_account, guard_appointment_update and the
-- notification trigger are recreated without their slot logic.
--
-- DATA: slot, hold and blackout rows are deleted. Bookings made before
-- sessions keep their date and time (appointment_date / start_time) and
-- still show in the app.
--
-- Idempotent: safe to re-run.
-- =========================================================================

-- 1. Stop the hold sweep first, so it never runs against a dropped function.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(j.jobid)
    from cron.job j
    where j.jobname = 'cleanup-expired-slot-holds';
  end if;
end;
$$;

-- 2. Functions that stay, minus slot logic.
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

  -- Session places are a live count, so cancelling frees the place.
  update public.appointments set status = 'cancelled' where id = p_appointment_id;

  return jsonb_build_object('success', true, 'appointment_id', p_appointment_id);
end;
$$;

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
      new.reason, new.address)
     is distinct from
     (old.patient_id, old.account_holder_id, old.beneficiary_id, old.doctor_id,
      old.appointment_date, old.start_time, old.appointment_type,
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

create or replace function public.delete_my_account()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_name text;
  v_cancelled uuid[];
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'code', 'NOT_AUTHENTICATED');
  end if;

  -- Deliberately no assert_active_caller(): a deactivated patient can still
  -- delete their own data.
  select role, full_name into v_role, v_name
  from public.profiles
  where id = v_uid
  for update;

  if found and v_role <> 'patient' then
    return jsonb_build_object('success', false, 'code', 'STAFF_ACCOUNT');
  end if;

  -- 1. Cancel upcoming visits (frees their session places).
  with cancelled as (
    update public.appointments
    set status = 'cancelled'
    where (patient_id = v_uid or account_holder_id = v_uid)
      and status in ('pending', 'confirmed')
      and appointment_date >= current_date
    returning id
  )
  select coalesce(array_agg(c.id), '{}') into v_cancelled
  from cancelled c;

  if cardinality(v_cancelled) > 0 then
    update public.notification_deliveries d
    set payload = d.payload || jsonb_build_object(
      'appointmentDate', a.appointment_date,
      'startTime', a.start_time,
      'appointmentType', a.appointment_type,
      'patientName', coalesce(v_name, 'Patient'),
      'doctorName', coalesce(doc.full_name, 'Doctor'),
      'room', a.room,
      'videoUrl', a.video_url
    )
    from public.appointments a
    left join public.profiles doc on doc.id = a.doctor_id
    where d.appointment_id = a.id
      and a.id = any (v_cancelled)
      and d.recipient_id <> v_uid;
  end if;

  -- 2. Delete the user; the rest cascades (see header).
  delete from public.appointments
  where patient_id = v_uid or account_holder_id = v_uid;
  delete from auth.users where id = v_uid;

  return jsonb_build_object(
    'success', true,
    'cancelled_visits', cardinality(v_cancelled)
  );
end;
$$;

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

-- 3. Slot-only RPCs.
drop function if exists public.hold_slot_if_available(uuid, int);
drop function if exists public.release_slot_hold(uuid);
drop function if exists public.book_held_slot(uuid);
drop function if exists public.free_orphan_booked_slot(uuid);
drop function if exists public.cleanup_expired_slot_holds();
drop function if exists public.book_appointment_from_hold(uuid, uuid, text, text, text, text);
drop function if exists public.reschedule_appointment(uuid, uuid);

-- 4. Tables and view (policies, triggers and indexes go with them).
drop view if exists public.doctor_next_available_slots;
drop table if exists public.slot_holds;
drop table if exists public.blackout_rules;
alter table public.appointments drop column if exists slot_id;
drop table if exists public.appointment_slots;

-- 5. Unused setting (the post-visit buffer belonged to slots).
alter table public.hospital_settings drop column if exists buffer_minutes;
