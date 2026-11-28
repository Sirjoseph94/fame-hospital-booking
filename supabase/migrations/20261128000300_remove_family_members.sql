-- =========================================================================
-- Removing family members
-- Runs after 20261128000200_session_room.sql.
--
-- Family members (beneficiaries) can be edited through the existing
-- "Account holders manage beneficiaries" policy. Removing one archives it
-- instead of deleting it, so past visits keep their patient name (and the
-- appointments.beneficiary_id foreign key stays valid).
--
--   * remove_beneficiary: owner only; never the account holder's own "self"
--     row; refused while the person has upcoming bookings.
--   * book_session refuses archived family members.
--
-- Idempotent: safe to re-run.
-- =========================================================================

alter table public.beneficiaries
  add column if not exists archived_at timestamptz;

create or replace function public.remove_beneficiary(p_beneficiary_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.beneficiaries%rowtype;
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'code', 'NOT_AUTHENTICATED');
  end if;
  perform public.assert_active_caller();

  select * into v_row from public.beneficiaries where id = p_beneficiary_id for update;
  if not found or v_row.account_holder_id <> v_uid then
    return jsonb_build_object('success', false, 'code', 'NOT_FOUND');
  end if;
  if v_row.relationship = 'self' then
    return jsonb_build_object('success', false, 'code', 'CANNOT_REMOVE_SELF');
  end if;
  if v_row.archived_at is not null then
    return jsonb_build_object('success', true);
  end if;
  if exists (
    select 1 from public.appointments a
    where a.beneficiary_id = p_beneficiary_id
      and a.status in ('pending', 'confirmed')
      and a.appointment_date >= public.hospital_now()::date
  ) then
    return jsonb_build_object('success', false, 'code', 'HAS_UPCOMING_VISITS');
  end if;

  update public.beneficiaries set archived_at = now() where id = p_beneficiary_id;
  return jsonb_build_object('success', true);
end;
$$;

revoke execute on function public.remove_beneficiary(uuid) from public, anon;
grant execute on function public.remove_beneficiary(uuid) to authenticated;

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
