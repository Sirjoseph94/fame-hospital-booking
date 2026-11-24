-- Behavioural tests for the migration chain. Any FAIL aborts (ON_ERROR_STOP).
\set ON_ERROR_STOP 1
set client_min_messages = notice;

create schema t;
grant usage on schema t to public;
create function t.ok(cond boolean, msg text) returns void language plpgsql as $$
begin
  if not coalesce(cond, false) then raise exception 'FAIL: %', msg; end if;
  raise notice 'PASS: %', msg;
end $$;
grant execute on function t.ok(boolean, text) to public;

-- Users. P/Q patients, D future doctor, A admin, X tries to sign up as admin.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', 'p@x.test', '{"full_name":"Pat"}'),
  ('00000000-0000-0000-0000-0000000000a2', 'q@x.test', '{"full_name":"Quinn"}'),
  ('00000000-0000-0000-0000-0000000000d1', 'd@x.test', '{"full_name":"Doc"}'),
  ('00000000-0000-0000-0000-0000000000ad', 'a@x.test', '{"full_name":"Admin"}'),
  ('00000000-0000-0000-0000-0000000000ee', 'x@x.test', '{"full_name":"Evil","role":"admin"}');

select t.ok((select role from public.profiles where id = '00000000-0000-0000-0000-0000000000ee') = 'patient',
  'sign-up metadata role=admin is ignored (profile is patient)');

-- Bootstrap admin as the DB owner (RUNBOOK §3 path).
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000000ad';
select t.ok((select role from public.profiles where id = '00000000-0000-0000-0000-0000000000ad') = 'admin',
  'owner (SQL editor) can promote the first admin');

-- ---------------------------------------------------------------- patient P
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","email":"p@x.test","role":"authenticated"}', false);
set role authenticated;

do $$ begin
  begin
    update public.profiles set role = 'admin' where id = auth.uid();
    raise exception 'FAIL: patient changed own role';
  exception when insufficient_privilege then raise notice 'PASS: patient cannot set own role=admin'; end;
  begin
    update public.profiles set is_active = false where id = auth.uid();
    raise exception 'FAIL: patient changed own is_active';
  exception when insufficient_privilege then raise notice 'PASS: patient cannot change own is_active'; end;
end $$;

update public.profiles set full_name = 'Pat Renamed', phone = '+15551234567' where id = auth.uid();
select t.ok((select full_name from public.profiles where id = auth.uid()) = 'Pat Renamed',
  'patient can still edit own name/phone');

insert into public.beneficiaries (id, account_holder_id, display_name, relationship, dob, gender)
values ('00000000-0000-0000-0000-0000000000b1', auth.uid(), 'Pat', 'self', '1990-01-01', 'female');

do $$ begin
  begin
    perform public.log_admin_audit('fake', 'profile', auth.uid(), '{}');
    raise exception 'FAIL: authenticated could call log_admin_audit';
  exception when insufficient_privilege then raise notice 'PASS: log_admin_audit not callable by authenticated'; end;
  begin
    perform public.enqueue_notification_deliveries(null, auth.uid(), 'visit_confirmed');
    raise exception 'FAIL: authenticated could call enqueue_notification_deliveries';
  exception when insufficient_privilege then raise notice 'PASS: enqueue_notification_deliveries not callable by authenticated'; end;
end $$;

-- ---------------------------------------------------------------- patient Q
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2","email":"q@x.test","role":"authenticated"}', false);
set role authenticated;
insert into public.beneficiaries (id, account_holder_id, display_name, relationship, dob, gender)
values ('00000000-0000-0000-0000-0000000000b2', auth.uid(), 'Quinn', 'self', '1991-01-01', 'male');

-- ---------------------------------------------------------------- admin creates invite
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ad","email":"a@x.test","role":"authenticated"}', false);
set role authenticated;
insert into public.doctor_invites (code, email, specialty, created_by)
values ('INVITE01', 'D@X.test', 'Cardiology', auth.uid());
select t.ok((select count(*) from public.admin_audit_log where action = 'doctor_invite_created') = 1,
  'audit trigger still logs invite creation (admin)');

-- ---------------------------------------------------------------- Q tries to steal the invite
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2","email":"q@x.test","role":"authenticated"}', false);
set role authenticated;
select t.ok((select count(*) from public.doctor_invites) = 0, 'non-admin cannot read doctor_invites');
select t.ok((public.claim_doctor_invite('invite01')->>'success')::boolean = false,
  'claiming an invite issued to another email fails');
select t.ok((select role from public.profiles where id = auth.uid()) = 'patient', 'Q is still a patient');

-- ---------------------------------------------------------------- D claims (case-insensitive email + code)
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","email":"d@x.test","role":"authenticated"}', false);
set role authenticated;
select t.ok((public.claim_doctor_invite(' invite01 ')->>'success')::boolean, 'invited email can claim invite');
select t.ok((select role from public.profiles where id = auth.uid()) = 'doctor', 'claim promotes to doctor');
select t.ok((public.claim_doctor_invite('INVITE01')->>'success')::boolean = false, 'invite cannot be claimed twice');

do $$ begin
  begin
    update public.doctors set is_active = false where id = auth.uid();
    raise exception 'FAIL: doctor toggled own is_active';
  exception when insufficient_privilege then raise notice 'PASS: doctor cannot change own doctors.is_active'; end;
end $$;
update public.doctors set bio = 'Heart doctor' where id = auth.uid();
select t.ok((select bio from public.doctors where id = auth.uid()) = 'Heart doctor', 'doctor can edit own bio');

insert into public.appointment_slots (id, doctor_id, slot_date, start_time, end_time, status) values
  ('00000000-0000-0000-0000-00000000c001', auth.uid(), current_date + 1, '09:00', '09:30', 'available'),
  ('00000000-0000-0000-0000-00000000c002', auth.uid(), current_date + 1, '09:30', '10:00', 'available');

do $$ begin
  begin
    insert into public.appointment_slots (doctor_id, slot_date, start_time, end_time)
    values (auth.uid(), current_date + 2, '10:00', '09:00');
    raise exception 'FAIL: inverted slot accepted';
  exception when check_violation then raise notice 'PASS: slot end_time must be after start_time'; end;
end $$;

-- ---------------------------------------------------------------- holds
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","email":"p@x.test","role":"authenticated"}', false);
set role authenticated;
select t.ok((public.hold_slot_if_available('00000000-0000-0000-0000-00000000c001')->>'success')::boolean, 'P holds slot 1');

reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2","email":"q@x.test","role":"authenticated"}', false);
set role authenticated;
select t.ok(public.hold_slot_if_available('00000000-0000-0000-0000-00000000c001')->>'code' = 'SLOT_TAKEN', 'Q cannot hold P''s held slot');
select t.ok((select count(*) from public.slot_holds) = 0, 'Q cannot see other users'' holds');
select t.ok(public.book_appointment_from_hold('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-0000000000b2')->>'code' = 'HOLD_EXPIRED',
  'Q cannot book on P''s hold');

reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","email":"p@x.test","role":"authenticated"}', false);
set role authenticated;
select t.ok((public.hold_slot_if_available('00000000-0000-0000-0000-00000000c002')->>'success')::boolean, 'P holds slot 2');
select t.ok((select count(*) from public.slot_holds where held_by = auth.uid()) = 1, 'new hold released P''s previous hold');
select t.ok((select status from public.appointment_slots where id = '00000000-0000-0000-0000-00000000c001') = 'available',
  'released slot 1 is available again');
select t.ok((public.hold_slot_if_available('00000000-0000-0000-0000-00000000c001')->>'success')::boolean, 'P re-holds slot 1');

-- ---------------------------------------------------------------- booking
do $$ begin
  begin
    insert into public.appointments (patient_id, account_holder_id, beneficiary_id, doctor_id, slot_id, appointment_date, start_time, status)
    values (auth.uid(), auth.uid(), '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000d1',
            '00000000-0000-0000-0000-00000000c001', current_date + 1, '09:00', 'confirmed');
    raise exception 'FAIL: patient inserted appointment directly';
  exception when insufficient_privilege then raise notice 'PASS: patient cannot insert appointments directly'; end;
end $$;

select t.ok(public.book_appointment_from_hold('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-0000000000b2')->>'code' = 'FORBIDDEN',
  'P cannot book for Q''s beneficiary');

create temp table r as
  select public.book_appointment_from_hold('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-0000000000b1', 'telehealth', 'checkup') as res;
select t.ok(((select res from r)->>'success')::boolean, 'P books slot 1 via RPC');
select t.ok((select status from public.appointment_slots where id = '00000000-0000-0000-0000-00000000c001') = 'booked', 'slot 1 is booked');
select t.ok((select count(*) from public.slot_holds where slot_id = '00000000-0000-0000-0000-00000000c001') = 0, 'hold cleared after booking');

reset role;
select t.ok((select count(*) from public.notification_deliveries) = 6,
  'booking trigger still enqueues notifications (6 rows) despite revoked EXECUTE');

-- P tries to self-confirm: no UPDATE policy for patients any more → 0 rows.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","email":"p@x.test","role":"authenticated"}', false);
set role authenticated;
do $$ declare n int; begin
  update public.appointments set status = 'confirmed' where account_holder_id = auth.uid();
  get diagnostics n = row_count;
  perform t.ok(n = 0, 'patient cannot update appointments directly');
end $$;

-- ---------------------------------------------------------------- doctor actions
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","email":"d@x.test","role":"authenticated"}', false);
set role authenticated;
do $$ begin
  begin
    update public.appointments set status = 'completed' where doctor_id = auth.uid();
    raise exception 'FAIL: pending -> completed allowed';
  exception when insufficient_privilege then raise notice 'PASS: doctor cannot complete a pending visit'; end;
  begin
    update public.appointments set appointment_date = current_date + 5 where doctor_id = auth.uid();
    raise exception 'FAIL: doctor moved appointment directly';
  exception when insufficient_privilege then raise notice 'PASS: doctor cannot move appointment without reschedule'; end;
  begin
    update public.appointments set video_url = 'javascript:alert(1)' where doctor_id = auth.uid();
    raise exception 'FAIL: non-https video url accepted';
  exception when invalid_parameter_value then raise notice 'PASS: video_url must be https'; end;
end $$;
update public.appointments set status = 'confirmed', video_url = 'https://meet.example/abc' where doctor_id = auth.uid();
select t.ok((select status from public.appointments where doctor_id = auth.uid()) = 'confirmed', 'doctor can confirm with https video link');
select t.ok(public.free_orphan_booked_slot('00000000-0000-0000-0000-00000000c001')->>'code' = 'SLOT_IN_USE',
  'doctor free_orphan on in-use slot is refused');

-- ---------------------------------------------------------------- reschedule + cancel
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","email":"p@x.test","role":"authenticated"}', false);
set role authenticated;
select t.ok(public.free_orphan_booked_slot('00000000-0000-0000-0000-00000000c001')->>'code' = 'FORBIDDEN',
  'patient cannot call free_orphan_booked_slot on doctor''s slot');
select t.ok((public.hold_slot_if_available('00000000-0000-0000-0000-00000000c002')->>'success')::boolean, 'P holds slot 2 for reschedule');
select t.ok((public.reschedule_appointment((select (res->>'appointment_id')::uuid from r), '00000000-0000-0000-0000-00000000c002')->>'success')::boolean,
  'P reschedules to slot 2');
select t.ok((select status from public.appointment_slots where id = '00000000-0000-0000-0000-00000000c001') = 'available', 'old slot freed');
select t.ok((select status from public.appointment_slots where id = '00000000-0000-0000-0000-00000000c002') = 'booked', 'new slot booked');

reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2","email":"q@x.test","role":"authenticated"}', false);
set role authenticated;
select t.ok(public.cancel_appointment((select (res->>'appointment_id')::uuid from r))->>'code' = 'FORBIDDEN', 'Q cannot cancel P''s appointment');

reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","email":"p@x.test","role":"authenticated"}', false);
set role authenticated;
select t.ok((public.cancel_appointment((select (res->>'appointment_id')::uuid from r))->>'success')::boolean, 'P cancels own appointment');
select t.ok((select status from public.appointment_slots where id = '00000000-0000-0000-0000-00000000c002') = 'available', 'cancel frees the slot');
select t.ok(public.cancel_appointment((select (res->>'appointment_id')::uuid from r))->>'code' = 'NOT_MODIFIABLE', 'cannot cancel twice');

-- ---------------------------------------------------------------- anon
reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', false);
set role anon;
do $$ begin
  begin
    perform public.log_admin_audit('fake', 'profile', null, '{}');
    raise exception 'FAIL: anon could call log_admin_audit';
  exception when insufficient_privilege then raise notice 'PASS: anon cannot call log_admin_audit'; end;
  begin
    perform public.book_appointment_from_hold(gen_random_uuid(), gen_random_uuid());
    raise exception 'FAIL: anon could call booking RPC';
  exception when insufficient_privilege then raise notice 'PASS: anon cannot call booking RPCs'; end;
end $$;

-- ---------------------------------------------------------------- one active appointment per slot
reset role;
select set_config('request.jwt.claims', '', false);
insert into public.appointments (patient_id, account_holder_id, beneficiary_id, doctor_id, slot_id, appointment_date, start_time, status)
values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1',
        '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-00000000c001', current_date + 1, '09:00', 'pending');
do $$ begin
  begin
    insert into public.appointments (patient_id, account_holder_id, beneficiary_id, doctor_id, slot_id, appointment_date, start_time, status)
    values ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000b2',
            '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-00000000c001', current_date + 1, '09:00', 'pending');
    raise exception 'FAIL: double booking allowed';
  exception when unique_violation then raise notice 'PASS: second active appointment on same slot rejected'; end;
end $$;

\echo ALL TESTS PASSED
