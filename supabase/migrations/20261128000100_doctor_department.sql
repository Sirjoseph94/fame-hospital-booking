-- =========================================================================
-- Doctor department on invites
-- Runs after 20261128000000_clinic_sessions.sql.
--
-- doctors.department was never set by the app (every doctor showed the
-- default "Outpatients"). Invites now carry a department that is copied to
-- the doctor when the invite is claimed. Admins can also edit it later
-- (existing "Admins can manage doctors" policy).
--
-- Idempotent: safe to re-run.
-- =========================================================================

alter table public.doctor_invites
  add column if not exists department text;

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

  insert into public.doctors (id, specialty, department, bio, consultation_fee, years_experience, is_active)
  values (
    v_uid,
    v_invite.specialty,
    coalesce(nullif(trim(v_invite.department), ''), 'Outpatients'),
    v_invite.bio,
    coalesce(v_invite.consultation_fee, 0),
    coalesce(v_invite.years_experience, 0),
    true
  )
  on conflict (id) do update
  set specialty = excluded.specialty,
      department = excluded.department,
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
