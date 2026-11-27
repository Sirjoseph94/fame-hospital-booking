-- Self-service account deletion (App Store guideline 5.1.1(v); Google Play
-- account deletion policy).
--
-- Patients only. A doctor or admin profile cascades to public.doctors and from
-- there to every slot and appointment on that doctor's schedule (other
-- patients' visits), so staff accounts are removed by the hospital instead.
--
-- What happens, in one transaction:
--   1. Slot holds are released, so those slots don't stay 'held'.
--   2. Upcoming visits (today or later, pending/confirmed) are cancelled and
--      their slots reopened. The normal trigger queues "visit cancelled"
--      notifications for the doctor. The appointment row is deleted in step 4,
--      so the visit details are copied onto the doctor's delivery rows
--      (payload) for the dispatcher to use.
--   3. Everything else is removed by deleting the auth user. ON DELETE CASCADE
--      from auth.users -> profiles covers beneficiaries, appointments,
--      slot_holds, notification_preferences, push_device_tokens and the user's
--      own notification_deliveries. doctor_invites.accepted_by and
--      admin_audit_log.actor_id are set to null.

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

  -- 1. Release holds.
  with released as (
    delete from public.slot_holds
    where held_by = v_uid
    returning slot_id
  )
  update public.appointment_slots s
  set status = 'available'
  from released r
  where s.id = r.slot_id and s.status = 'held';

  -- 2. Cancel upcoming visits.
  with cancelled as (
    update public.appointments
    set status = 'cancelled'
    where (patient_id = v_uid or account_holder_id = v_uid)
      and status in ('pending', 'confirmed')
      and appointment_date >= current_date
    returning id, slot_id
  ),
  reopened as (
    update public.appointment_slots s
    set status = 'available'
    from cancelled c
    where s.id = c.slot_id and s.status = 'booked'
    returning s.id
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

  -- 3. Delete the user; the rest cascades (see header).
  delete from public.appointments
  where patient_id = v_uid or account_holder_id = v_uid;
  delete from auth.users where id = v_uid;

  return jsonb_build_object(
    'success', true,
    'cancelled_visits', cardinality(v_cancelled)
  );
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
