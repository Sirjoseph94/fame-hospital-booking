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

-- Older sections book up to 91 days ahead; the booking window is tested on its own below.
update public.hospital_settings set booking_window_days = 365 where id = 1;

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

-- ---------------------------------------------------------------- booking (clinic sessions)
-- Afternoon sessions far ahead, so the later "earliest open session" tests
-- (morning sessions from +7 days) are unaffected.
reset role;
select set_config('request.jwt.claims', '', false);
insert into public.clinic_sessions (id, doctor_id, session_date, start_time, end_time, capacity) values
  ('00000000-0000-0000-0000-0000000005a1', '00000000-0000-0000-0000-0000000000d1', current_date + 90, '15:00', '17:00', 5),
  ('00000000-0000-0000-0000-0000000005a2', '00000000-0000-0000-0000-0000000000d1', current_date + 91, '15:00', '17:00', 5);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","email":"p@x.test","role":"authenticated"}', false);
set role authenticated;
do $$ begin
  begin
    insert into public.appointments (patient_id, account_holder_id, beneficiary_id, doctor_id, session_id, appointment_date, start_time, status)
    values (auth.uid(), auth.uid(), '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000d1',
            '00000000-0000-0000-0000-0000000005a1', current_date + 90, '15:00', 'confirmed');
    raise exception 'FAIL: patient inserted appointment directly';
  exception when insufficient_privilege then raise notice 'PASS: patient cannot insert appointments directly'; end;
end $$;

select t.ok(public.book_session('00000000-0000-0000-0000-0000000005a1', '00000000-0000-0000-0000-0000000000b2')->>'code' = 'FORBIDDEN',
  'P cannot book for Q''s beneficiary');

create temp table r as
  select public.book_session('00000000-0000-0000-0000-0000000005a1', '00000000-0000-0000-0000-0000000000b1', 'checkup') as res;
grant select on r to public;
select t.ok(((select res from r)->>'success')::boolean, 'P books a session via RPC');

reset role;
select t.ok((select count(*) from public.notification_deliveries) = 3,
  'booking trigger still enqueues notifications (3 rows) despite revoked EXECUTE');

-- P tries to change their booking directly: no UPDATE policy for patients → 0 rows.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","email":"p@x.test","role":"authenticated"}', false);
set role authenticated;
do $$ declare n int; begin
  update public.appointments set status = 'cancelled' where account_holder_id = auth.uid();
  get diagnostics n = row_count;
  perform t.ok(n = 0, 'patient cannot update appointments directly');
end $$;

-- ---------------------------------------------------------------- doctor actions (update guard)
-- A pending booking from before sessions, to test status transitions.
reset role;
select set_config('request.jwt.claims', '', false);
insert into public.appointments (id, patient_id, account_holder_id, beneficiary_id, doctor_id, appointment_date, start_time, status)
values ('00000000-0000-0000-0000-0000000000f0', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1',
        '00000000-0000-0000-0000-0000000000d1', current_date + 2, '10:00', 'pending');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","email":"d@x.test","role":"authenticated"}', false);
set role authenticated;
do $$ begin
  begin
    update public.appointments set status = 'completed' where id = '00000000-0000-0000-0000-0000000000f0';
    raise exception 'FAIL: pending -> completed allowed';
  exception when insufficient_privilege then raise notice 'PASS: doctor cannot complete a pending visit'; end;
  begin
    update public.appointments set appointment_date = current_date + 5 where id = '00000000-0000-0000-0000-0000000000f0';
    raise exception 'FAIL: doctor moved appointment directly';
  exception when insufficient_privilege then raise notice 'PASS: doctor cannot move an appointment directly'; end;
  begin
    update public.appointments set video_url = 'javascript:alert(1)' where id = '00000000-0000-0000-0000-0000000000f0';
    raise exception 'FAIL: non-https video url accepted';
  exception when invalid_parameter_value then raise notice 'PASS: video_url must be https'; end;
end $$;
update public.appointments set status = 'confirmed', video_url = 'https://meet.example/abc'
where id = '00000000-0000-0000-0000-0000000000f0';
select t.ok((select status from public.appointments where id = '00000000-0000-0000-0000-0000000000f0') = 'confirmed',
  'doctor can confirm with an https video link');

-- ---------------------------------------------------------------- move + cancel
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","email":"p@x.test","role":"authenticated"}', false);
set role authenticated;
select t.ok((public.move_session_booking((select (res->>'appointment_id')::uuid from r), '00000000-0000-0000-0000-0000000005a2')->>'success')::boolean,
  'P moves the booking to another session');
select t.ok((select session_id from public.appointments where id = (select (res->>'appointment_id')::uuid from r)) = '00000000-0000-0000-0000-0000000005a2',
  'booking now belongs to the new session');

reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2","email":"q@x.test","role":"authenticated"}', false);
set role authenticated;
select t.ok(public.cancel_appointment((select (res->>'appointment_id')::uuid from r))->>'code' = 'FORBIDDEN', 'Q cannot cancel P''s appointment');

reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","email":"p@x.test","role":"authenticated"}', false);
set role authenticated;
select t.ok((public.cancel_appointment((select (res->>'appointment_id')::uuid from r))->>'success')::boolean, 'P cancels own appointment');
select t.ok((select places_left from public.clinic_session_availability where session_id = '00000000-0000-0000-0000-0000000005a2') = 5,
  'cancelling frees the place');
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
    perform public.cancel_appointment(gen_random_uuid());
    raise exception 'FAIL: anon could call cancel_appointment';
  exception when insufficient_privilege then raise notice 'PASS: anon cannot call booking RPCs'; end;
  begin
    perform 1 from public.doctor_next_open_session;
    raise exception 'FAIL: anon read next-open-session view';
  exception when insufficient_privilege then raise notice 'PASS: anon cannot read next-open-session view'; end;
end $$;
reset role;

-- ---------------------------------------------------------------- one "self" beneficiary per account
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","email":"p@x.test","role":"authenticated"}', false);
set role authenticated;
do $$ begin
  begin
    insert into public.beneficiaries (account_holder_id, display_name, relationship, dob, gender)
    values (auth.uid(), 'Pat again', 'self', '1990-01-01', 'female');
    raise exception 'FAIL: second self beneficiary accepted';
  exception when unique_violation then raise notice 'PASS: only one "self" beneficiary per account'; end;
end $$;
insert into public.beneficiaries (account_holder_id, display_name, relationship, dob, gender)
values (auth.uid(), 'Kid', 'child', '2015-01-01', 'male');
select t.ok((select count(*) from public.beneficiaries where account_holder_id = auth.uid()) = 2,
  'other relationships are unaffected');
reset role;

-- ---------------------------------------------------------------- account deactivation
-- Admin deactivates Q (through the app's normal path: an authenticated admin update).
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ad","email":"a@x.test","role":"authenticated"}', false);
set role authenticated;
update public.profiles set is_active = false where id = '00000000-0000-0000-0000-0000000000a2';
select t.ok((select is_active from public.profiles where id = '00000000-0000-0000-0000-0000000000a2') = false,
  'admin can deactivate an account');

reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2","email":"q@x.test","role":"authenticated"}', false);
set role authenticated;
select t.ok((select count(*) from public.profiles where id = auth.uid()) = 1,
  'deactivated user can still read own profile (app shows "deactivated")');
select t.ok((select count(*) from public.beneficiaries) = 0, 'deactivated user cannot read own beneficiaries');
select t.ok((select count(*) from public.clinic_sessions) = 0, 'deactivated user cannot read sessions');
select t.ok((select count(*) from public.doctors) = 0, 'deactivated user cannot read doctors');
select t.ok((select count(*) from public.doctor_next_open_session) = 0, 'deactivated user sees nothing via next-open-session view');
do $$ declare n int; begin
  update public.profiles set full_name = 'Still here' where id = auth.uid();
  get diagnostics n = row_count;
  perform t.ok(n = 0, 'deactivated user cannot update own profile');
end $$;
do $$ begin
  begin
    perform public.book_session('00000000-0000-0000-0000-0000000005a1', '00000000-0000-0000-0000-0000000000b2');
    raise exception 'FAIL: deactivated user booked a session';
  exception when insufficient_privilege then raise notice 'PASS: deactivated user cannot book'; end;
  begin
    perform public.claim_doctor_invite('ANYTHING');
    raise exception 'FAIL: deactivated user called claim_doctor_invite';
  exception when insufficient_privilege then raise notice 'PASS: deactivated user cannot claim invites'; end;
end $$;

-- Deactivated doctor loses doctor powers too.
reset role;
update public.profiles set is_active = false where id = '00000000-0000-0000-0000-0000000000d1';
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","email":"d@x.test","role":"authenticated"}', false);
set role authenticated;
do $$ declare n int; begin
  update public.appointments set status = 'confirmed' where doctor_id = auth.uid();
  get diagnostics n = row_count;
  perform t.ok(n = 0, 'deactivated doctor cannot update appointments');
  perform public.create_clinic_sessions(auth.uid(), current_date + 3, 1,
    array[extract(dow from current_date + 3)::int], '11:00', '11:30', 5);
  raise exception 'FAIL: deactivated doctor created a session';
exception when insufficient_privilege then
  raise notice 'PASS: deactivated doctor cannot create sessions';
end $$;

-- Reactivation restores access.
reset role;
update public.profiles set is_active = true
where id in ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000d1');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2","email":"q@x.test","role":"authenticated"}', false);
set role authenticated;
select t.ok((select count(*) from public.beneficiaries) = 1, 'reactivated user regains access');
reset role;

-- ---------------------------------------------------------------- account deletion
-- R: a patient with a family member, an upcoming session booking, an older
-- upcoming booking without a session (its doctor is notified), a past visit
-- and notification preferences.
select set_config('request.jwt.claims', '', false);
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a3', 'r@x.test', '{"full_name":"Remy"}');
insert into public.beneficiaries (id, account_holder_id, display_name, relationship, dob, gender) values
  ('00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000a3', 'Remy', 'self', '1985-01-01', 'female'),
  ('00000000-0000-0000-0000-0000000000b4', '00000000-0000-0000-0000-0000000000a3', 'Remy Jr', 'child', '2016-01-01', 'male');
insert into public.clinic_sessions (id, doctor_id, session_date, start_time, end_time, capacity) values
  ('00000000-0000-0000-0000-0000000005a3', '00000000-0000-0000-0000-0000000000d1', current_date + 92, '15:00', '17:00', 2);
insert into public.appointments (id, patient_id, account_holder_id, beneficiary_id, doctor_id, session_id, appointment_date, start_time, status) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a3',
   '00000000-0000-0000-0000-0000000000b4', '00000000-0000-0000-0000-0000000000d1', null, current_date + 5, '09:00', 'confirmed'),
  ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a3',
   '00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000d1', null, current_date - 5, '09:00', 'completed'),
  ('00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a3',
   '00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000005a3', current_date + 92, '15:00', 'confirmed');
insert into public.notification_preferences (user_id, email_opt_in) values
  ('00000000-0000-0000-0000-0000000000a3', true);

set role anon;
do $$ begin
  begin
    perform public.delete_my_account();
    raise exception 'FAIL: anon called delete_my_account';
  exception when insufficient_privilege then raise notice 'PASS: anon cannot call delete_my_account'; end;
end $$;
reset role;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","email":"d@x.test","role":"authenticated"}', false);
set role authenticated;
select t.ok(public.delete_my_account()->>'code' = 'STAFF_ACCOUNT', 'doctor cannot self-delete (would cascade to other patients'' visits)');
reset role;
select t.ok((select count(*) from public.doctors where id = '00000000-0000-0000-0000-0000000000d1') = 1, 'doctor row untouched');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a3","email":"r@x.test","role":"authenticated"}', false);
set role authenticated;
select t.ok((public.delete_my_account()->>'cancelled_visits')::int = 2, 'patient deletes own account; both upcoming visits cancelled');
reset role;
select set_config('request.jwt.claims', '', false);

select t.ok(not exists (select 1 from auth.users where id = '00000000-0000-0000-0000-0000000000a3'), 'auth user deleted');
select t.ok(not exists (select 1 from public.profiles where id = '00000000-0000-0000-0000-0000000000a3'), 'profile deleted');
select t.ok(not exists (select 1 from public.beneficiaries where account_holder_id = '00000000-0000-0000-0000-0000000000a3'), 'family members deleted');
select t.ok(not exists (select 1 from public.appointments where id in ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000f3')),
  'upcoming and past appointments deleted');
select t.ok(not exists (select 1 from public.notification_preferences where user_id = '00000000-0000-0000-0000-0000000000a3'), 'notification preferences deleted');
select t.ok(not exists (select 1 from public.notification_deliveries where recipient_id = '00000000-0000-0000-0000-0000000000a3'),
  'deleted patient''s own notifications removed');
select t.ok(not exists (select 1 from public.appointments where session_id = '00000000-0000-0000-0000-0000000005a3'),
  'the session place is free again');
select t.ok((select count(*) from public.notification_deliveries
             where recipient_id = '00000000-0000-0000-0000-0000000000d1'
               and event_type = 'visit_cancelled'
               and appointment_id is null
               and payload->>'startTime' like '09:00%'
               and payload->>'patientName' = 'Remy') = 3,
  'doctor of the older booking still gets "visit cancelled" (3 channels) with visit details in payload');

-- ---------------------------------------------------------------- clinic sessions
-- D = doctor, P (b1 + "Kid") and Q (b2) = patients, AD = admin.
reset role;
select set_config('request.jwt.claims', '', false);
create temp table s_ids (k text primary key, id uuid);
grant all on s_ids to public;
-- Make "today" agree between current_date (used below) and hospital_now().
update public.hospital_settings set time_zone = current_setting('TimeZone') where id = 1;

-- Patients cannot create sessions.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","email":"p@x.test","role":"authenticated"}', false);
set role authenticated;
select t.ok(public.create_clinic_sessions('00000000-0000-0000-0000-0000000000d1', current_date + 7, 1,
  array[extract(dow from current_date + 7)::int], '09:00', '12:00', 2)->>'code' = 'FORBIDDEN',
  'patient cannot create clinic sessions');
reset role;

-- Doctor creates a weekly session for 2 weeks (capacity 2).
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","email":"d@x.test","role":"authenticated"}', false);
set role authenticated;
select t.ok((public.create_clinic_sessions('00000000-0000-0000-0000-0000000000d1', current_date + 7, 2,
  array[extract(dow from current_date + 7)::int], '09:00', '12:00', 2)->>'created')::int = 2,
  'doctor creates 2 weekly sessions');
select t.ok((public.create_clinic_sessions('00000000-0000-0000-0000-0000000000d1', current_date + 7, 2,
  array[extract(dow from current_date + 7)::int], '10:00', '11:00', 5)->>'skipped')::int = 2,
  'overlapping sessions on the same day are skipped');
select t.ok(public.create_clinic_sessions('00000000-0000-0000-0000-0000000000d1', current_date + 7, 1,
  array[1], '12:00', '09:00', 2)->>'code' = 'INVALID_INPUT',
  'end time before start time is rejected');
select t.ok(public.create_clinic_sessions('00000000-0000-0000-0000-0000000000d1', current_date - 1, 1,
  array[1], '09:00', '12:00', 2)->>'code' = 'INVALID_INPUT',
  'sessions cannot start in the past');
do $$ begin
  begin
    insert into public.clinic_sessions (doctor_id, session_date, start_time, end_time, capacity)
    values (auth.uid(), current_date + 30, '09:00', '10:00', 5);
    raise exception 'FAIL: doctor inserted a session directly';
  exception when insufficient_privilege then raise notice 'PASS: sessions can only be created through the RPC'; end;
end $$;
insert into s_ids
select 'S' || row_number() over (order by session_date), id
from public.clinic_sessions
where doctor_id = auth.uid() and start_time = '09:00' and session_date >= current_date + 7;
reset role;

-- P books S1 for themselves; duplicate and someone else's family member are refused.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","email":"p@x.test","role":"authenticated"}', false);
set role authenticated;
select t.ok((select places_left from public.clinic_session_availability where session_id = (select id from s_ids where k = 'S1')) = 2,
  'patient sees places left before booking');
insert into s_ids
select 'P1', (public.book_session((select id from s_ids where k = 'S1'), '00000000-0000-0000-0000-0000000000b1', 'cough')->>'appointment_id')::uuid;
select t.ok((select status from public.appointments where id = (select id from s_ids where k = 'P1')) = 'confirmed',
  'session booking is confirmed straight away');
select t.ok(public.book_session((select id from s_ids where k = 'S1'), '00000000-0000-0000-0000-0000000000b1')->>'code' = 'ALREADY_BOOKED',
  'same person cannot book the same session twice');
select t.ok(public.book_session((select id from s_ids where k = 'S1'), '00000000-0000-0000-0000-0000000000b2')->>'code' = 'FORBIDDEN',
  'cannot book for another account''s family member');
select t.ok(public.book_session((select id from s_ids where k = 'S1'), '00000000-0000-0000-0000-0000000000b1', repeat('x', 201))->>'code' = 'INVALID_INPUT',
  'reason longer than 200 characters is rejected');
reset role;

-- Q takes the last place; P's child is then refused.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2","email":"q@x.test","role":"authenticated"}', false);
set role authenticated;
select t.ok((public.book_session((select id from s_ids where k = 'S1'), '00000000-0000-0000-0000-0000000000b2')->>'success')::boolean,
  'second patient books the last place');
select t.ok((select places_left from public.clinic_session_availability where session_id = (select id from s_ids where k = 'S1')) = 0
  and not (select is_bookable from public.clinic_session_availability where session_id = (select id from s_ids where k = 'S1')),
  'full session shows 0 places and is not bookable');
select t.ok(public.move_session_booking((select id from s_ids where k = 'P1'), (select id from s_ids where k = 'S2'))->>'code' = 'FORBIDDEN',
  'patient cannot move someone else''s booking');
reset role;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","email":"p@x.test","role":"authenticated"}', false);
set role authenticated;
select t.ok(public.book_session((select id from s_ids where k = 'S1'),
  (select id from public.beneficiaries where account_holder_id = auth.uid() and relationship = 'child' limit 1))->>'code' = 'SESSION_FULL',
  'booking a full session is refused');

-- P moves to S2.
select t.ok((public.move_session_booking((select id from s_ids where k = 'P1'), (select id from s_ids where k = 'S2'))->>'success')::boolean,
  'patient moves own booking to another session');
select t.ok((select session_id from public.appointments where id = (select id from s_ids where k = 'P1')) = (select id from s_ids where k = 'S2')
  and (select appointment_date from public.appointments where id = (select id from s_ids where k = 'P1')) = current_date + 14,
  'move updates the session and the visit date');
select t.ok((select places_left from public.clinic_session_availability where session_id = (select id from s_ids where k = 'S1')) = 1,
  'moving frees a place in the old session');
reset role;

-- Notifications: patient gets "booked" + "rescheduled"; doctor gets nothing per patient.
select t.ok((select count(*) from public.notification_deliveries
             where appointment_id = (select id from s_ids where k = 'P1') and event_type = 'visit_booked'
               and recipient_id = '00000000-0000-0000-0000-0000000000a1') = 3,
  'patient is sent "visit booked" (3 channels)');
select t.ok((select count(*) from public.notification_deliveries
             where appointment_id = (select id from s_ids where k = 'P1') and event_type = 'visit_rescheduled') = 3,
  'patient is sent "visit rescheduled" after a move');
select t.ok(not exists (select 1 from public.notification_deliveries
             where appointment_id = (select id from s_ids where k = 'P1')
               and recipient_id = '00000000-0000-0000-0000-0000000000d1'),
  'doctor is not messaged per patient for session bookings');

-- Clients can't change session_id directly.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","email":"d@x.test","role":"authenticated"}', false);
set role authenticated;
do $$ begin
  begin
    update public.appointments set session_id = (select id from s_ids where k = 'S1')
    where id = (select id from s_ids where k = 'P1');
    raise exception 'FAIL: doctor changed session_id directly';
  exception when insufficient_privilege then raise notice 'PASS: session_id can only change through move_session_booking'; end;
end $$;

-- Doctor cancels S2 (P is booked): booking cancelled, patient notified.
select t.ok((public.cancel_clinic_session((select id from s_ids where k = 'S2'), 'Conference')->>'cancelled_bookings')::int = 1,
  'cancelling a session cancels its bookings');
select t.ok((select status from public.appointments where id = (select id from s_ids where k = 'P1')) = 'cancelled'
  and (select status from public.clinic_sessions where id = (select id from s_ids where k = 'S2')) = 'cancelled',
  'booking and session are both cancelled');
select t.ok(public.cancel_clinic_session((select id from s_ids where k = 'S2'))->>'code' = 'NOT_MODIFIABLE',
  'a cancelled session cannot be cancelled again');

-- An empty session is removed instead of cancelled.
select t.ok((public.create_clinic_sessions(auth.uid(), current_date + 40, 1,
  array[extract(dow from current_date + 40)::int], '14:00', '15:00', 3)->>'created')::int = 1, 'doctor creates a one-off session');
select t.ok((public.cancel_clinic_session((select id from public.clinic_sessions
  where doctor_id = auth.uid() and session_date = current_date + 40))->>'removed')::boolean,
  'cancelling an unbooked session removes it');

-- Not accepting bookings blocks new bookings.
update public.doctors set is_accepting_bookings = false where id = auth.uid();
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","email":"p@x.test","role":"authenticated"}', false);
set role authenticated;
select t.ok(public.book_session((select id from s_ids where k = 'S1'),
  (select id from public.beneficiaries where account_holder_id = auth.uid() and relationship = 'child' limit 1))->>'code' = 'DOCTOR_UNAVAILABLE',
  'doctor not accepting bookings: booking refused');
select t.ok(public.book_session((select id from s_ids where k = 'S2'), '00000000-0000-0000-0000-0000000000b1')->>'code' = 'SESSION_UNAVAILABLE',
  'cancelled session cannot be booked');
select t.ok(public.cancel_clinic_session((select id from s_ids where k = 'S1'))->>'code' = 'FORBIDDEN',
  'patient cannot cancel a session');
reset role;
update public.doctors set is_accepting_bookings = true where id = '00000000-0000-0000-0000-0000000000d1';

-- A session that has already ended cannot be booked.
insert into public.clinic_sessions (id, doctor_id, session_date, start_time, end_time, capacity)
values ('00000000-0000-0000-0000-0000000005e0', '00000000-0000-0000-0000-0000000000d1', current_date - 1, '09:00', '10:00', 5);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","email":"p@x.test","role":"authenticated"}', false);
set role authenticated;
select t.ok(public.book_session('00000000-0000-0000-0000-0000000005e0', '00000000-0000-0000-0000-0000000000b1')->>'code' = 'SESSION_UNAVAILABLE',
  'ended session cannot be booked');
select t.ok((select session_id from public.doctor_next_open_session where doctor_id = '00000000-0000-0000-0000-0000000000d1')
  = (select id from s_ids where k = 'S1'),
  'next open session is the earliest bookable one (skips ended and cancelled)');
reset role;

-- Admin can manage any doctor's sessions; anon can't book.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ad","email":"a@x.test","role":"authenticated"}', false);
set role authenticated;
select t.ok((public.create_clinic_sessions('00000000-0000-0000-0000-0000000000d1', current_date + 50, 1,
  array[extract(dow from current_date + 50)::int], '09:00', '10:00', 4)->>'created')::int = 1,
  'admin creates a session for a doctor');
reset role;
set role anon;
do $$ begin
  begin
    perform public.book_session(gen_random_uuid(), gen_random_uuid());
    raise exception 'FAIL: anon called book_session';
  exception when insufficient_privilege then raise notice 'PASS: anon cannot call book_session'; end;
  begin
    perform 1 from public.clinic_session_availability;
    raise exception 'FAIL: anon read session availability';
  exception when insufficient_privilege then raise notice 'PASS: anon cannot read session availability'; end;
end $$;
reset role;

-- Deactivated accounts see no availability.
update public.profiles set is_active = false where id = '00000000-0000-0000-0000-0000000000a2';
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2","email":"q@x.test","role":"authenticated"}', false);
set role authenticated;
select t.ok((select count(*) from public.clinic_session_availability) = 0, 'deactivated user sees no session availability');
select t.ok((select count(*) from public.clinic_sessions) = 0, 'deactivated user cannot read sessions');
reset role;
update public.profiles set is_active = true where id = '00000000-0000-0000-0000-0000000000a2';

-- ---------------------------------------------------------------- doctor department via invite
reset role;
select set_config('request.jwt.claims', '', false);
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000d2', 'd2@x.test', '{"full_name":"Doc Two"}');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ad","email":"a@x.test","role":"authenticated"}', false);
set role authenticated;
insert into public.doctor_invites (code, email, specialty, department, created_by)
values ('INVITE02', 'd2@x.test', 'Paediatrics', 'Children''s Clinic', auth.uid());
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d2","email":"d2@x.test","role":"authenticated"}', false);
set role authenticated;
select t.ok((public.claim_doctor_invite('INVITE02')->>'success')::boolean, 'second doctor claims an invite with a department');
reset role;
select t.ok((select department from public.doctors where id = '00000000-0000-0000-0000-0000000000d2') = 'Children''s Clinic',
  'invite department is copied to the doctor');
select t.ok((select department from public.doctors where id = '00000000-0000-0000-0000-0000000000d1') = 'Outpatients',
  'invite without a department falls back to Outpatients');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ad","email":"a@x.test","role":"authenticated"}', false);
set role authenticated;
update public.doctors set department = 'Cardiology Unit' where id = '00000000-0000-0000-0000-0000000000d2';
select t.ok((select department from public.doctors where id = '00000000-0000-0000-0000-0000000000d2') = 'Cardiology Unit',
  'admin can change a doctor''s department');
reset role;

-- ---------------------------------------------------------------- session room + edits
-- S1 (capacity 2) currently holds Q's booking. Fill it with P's child.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","email":"p@x.test","role":"authenticated"}', false);
set role authenticated;
select t.ok((public.book_session((select id from s_ids where k = 'S1'),
  (select id from public.beneficiaries where account_holder_id = auth.uid() and relationship = 'child' limit 1))->>'success')::boolean,
  'P books the last place in S1 for their child');
select t.ok(public.update_clinic_session((select id from s_ids where k = 'S1'), 'Room 4', 5)->>'code' = 'FORBIDDEN',
  'patient cannot edit a session');
reset role;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","email":"d@x.test","role":"authenticated"}', false);
set role authenticated;
select t.ok(public.update_clinic_session((select id from s_ids where k = 'S1'), 'Room 4', 1)->>'code' = 'CAPACITY_BELOW_BOOKED',
  'patient limit cannot go below places already booked');
select t.ok((public.update_clinic_session((select id from s_ids where k = 'S1'), '  Room 4 ', 3)->>'success')::boolean,
  'doctor sets room and raises the limit');
select t.ok((select room from public.clinic_session_availability where session_id = (select id from s_ids where k = 'S1')) = 'Room 4'
  and (select places_left from public.clinic_session_availability where session_id = (select id from s_ids where k = 'S1')) = 1,
  'availability shows the trimmed room and the new places left');
select t.ok(public.update_clinic_session((select id from s_ids where k = 'S2'), 'Room 1', 5)->>'code' = 'NOT_MODIFIABLE',
  'a cancelled session cannot be edited');
select t.ok((public.create_clinic_sessions(auth.uid(), current_date + 60, 1,
  array[extract(dow from current_date + 60)::int], '09:00', '10:00', 4, 'Room 9')->>'created')::int = 1,
  'sessions can be created with a room');
select t.ok((select room from public.clinic_sessions where doctor_id = auth.uid() and session_date = current_date + 60) = 'Room 9',
  'the room is stored on the session');
select t.ok(public.create_clinic_sessions(auth.uid(), current_date + 61, 1,
  array[extract(dow from current_date + 61)::int], '09:00', '10:00', 4, repeat('x', 41))->>'code' = 'INVALID_INPUT',
  'room names longer than 40 characters are rejected');
reset role;

-- ---------------------------------------------------------------- admin acts on bookings
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ad","email":"a@x.test","role":"authenticated"}', false);
set role authenticated;
select t.ok((public.move_session_booking(
    (select id from public.appointments where session_id = (select id from s_ids where k = 'S1')
       and beneficiary_id = '00000000-0000-0000-0000-0000000000b2' and status <> 'cancelled'),
    (select id from public.clinic_sessions where doctor_id = '00000000-0000-0000-0000-0000000000d1' and session_date = current_date + 50))->>'success')::boolean,
  'admin moves a patient''s booking to another session');
select t.ok((public.cancel_appointment(
    (select id from public.appointments where session_id = (select id from s_ids where k = 'S1')
       and status <> 'cancelled' limit 1))->>'success')::boolean,
  'admin cancels a patient''s booking');
reset role;
select t.ok((select places_left from public.clinic_session_availability where session_id = (select id from s_ids where k = 'S1')) = 3,
  'S1 is empty again after the admin move and cancel');

-- ---------------------------------------------------------------- doctor patient summary access
reset role;
select set_config('request.jwt.claims', '', false);
update public.profiles set allergies = 'Penicillin' where id = '00000000-0000-0000-0000-0000000000a1';
-- D has (and had) bookings from P; D2 never has.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","email":"d@x.test","role":"authenticated"}', false);
set role authenticated;
select t.ok((select allergies from public.profiles where id = '00000000-0000-0000-0000-0000000000a1') = 'Penicillin',
  'doctor can read health details of a patient booked with them');
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d2","email":"d2@x.test","role":"authenticated"}', false);
set role authenticated;
select t.ok(not exists (select 1 from public.profiles where id = '00000000-0000-0000-0000-0000000000a1'),
  'another doctor cannot read that patient''s profile');
reset role;

-- ---------------------------------------------------------------- family members: edit and remove
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","email":"p@x.test","role":"authenticated"}', false);
set role authenticated;
update public.beneficiaries set display_name = 'Kiddo', hospital_file_id = 'F-1001'
where account_holder_id = auth.uid() and relationship = 'child';
select t.ok((select display_name from public.beneficiaries where account_holder_id = auth.uid() and relationship = 'child') = 'Kiddo',
  'patient can edit a family member');
select t.ok(public.remove_beneficiary('00000000-0000-0000-0000-0000000000b1')->>'code' = 'CANNOT_REMOVE_SELF',
  'patient cannot remove their own "self" record');
select t.ok(public.remove_beneficiary('00000000-0000-0000-0000-0000000000b2')->>'code' = 'NOT_FOUND',
  'patient cannot remove another account''s family member');
-- Give the child an upcoming booking: removal is refused until it's cancelled.
insert into s_ids
select 'KID', (public.book_session((select id from s_ids where k = 'S1'),
  (select id from public.beneficiaries where account_holder_id = auth.uid() and relationship = 'child'))->>'appointment_id')::uuid;
select t.ok(public.remove_beneficiary((select id from public.beneficiaries where account_holder_id = auth.uid() and relationship = 'child'))->>'code' = 'HAS_UPCOMING_VISITS',
  'family member with an upcoming booking cannot be removed');
select t.ok((public.cancel_appointment((select id from s_ids where k = 'KID'))->>'success')::boolean, 'cancel the child''s booking');
select t.ok((public.remove_beneficiary((select id from public.beneficiaries where account_holder_id = auth.uid() and relationship = 'child'))->>'success')::boolean,
  'family member is removed once nothing is booked');
select t.ok((select archived_at is not null from public.beneficiaries where account_holder_id = auth.uid() and relationship = 'child'),
  'removal archives the row (history keeps the name)');
select t.ok(public.book_session((select id from s_ids where k = 'S1'),
  (select id from public.beneficiaries where account_holder_id = auth.uid() and relationship = 'child'))->>'code' = 'BENEFICIARY_REMOVED',
  'a removed family member cannot be booked');
reset role;

-- ---------------------------------------------------------------- hospital time zone
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ad","email":"a@x.test","role":"authenticated"}', false);
set role authenticated;
do $$ begin
  begin
    update public.hospital_settings set time_zone = 'Mars/Olympus_Mons' where id = 1;
    raise exception 'FAIL: invalid time zone accepted';
  exception when invalid_parameter_value then raise notice 'PASS: unknown time zone is rejected'; end;
end $$;
update public.hospital_settings set time_zone = 'Africa/Lagos' where id = 1;
select t.ok((select time_zone from public.hospital_settings where id = 1) = 'Africa/Lagos', 'admin sets a valid time zone');
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","email":"p@x.test","role":"authenticated"}', false);
set role authenticated;
do $$ declare n int; begin
  update public.hospital_settings set time_zone = 'UTC' where id = 1;
  get diagnostics n = row_count;
  perform t.ok(n = 0, 'patient cannot change the time zone');
end $$;
reset role;
update public.hospital_settings set time_zone = current_setting('TimeZone') where id = 1;

-- ---------------------------------------------------------------- failed notifications (admin)
reset role;
select set_config('request.jwt.claims', '', false);
update public.notification_deliveries
set status = 'failed', error = 'SMTP 550', attempts = 3
where id = (select id from public.notification_deliveries
            where recipient_id = '00000000-0000-0000-0000-0000000000a1' order by created_at limit 1);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ad","email":"a@x.test","role":"authenticated"}', false);
set role authenticated;
select t.ok((select count(*) from public.notification_deliveries where status = 'failed') = 1,
  'admin can see failed deliveries for any recipient');
select t.ok((public.retry_notification_delivery((select id from public.notification_deliveries where status = 'failed'))->>'success')::boolean,
  'admin retries a failed delivery');
select t.ok((select count(*) from public.notification_deliveries where status = 'failed') = 0
  and exists (select 1 from public.notification_deliveries where error is null and attempts = 0 and status = 'pending'
              and recipient_id = '00000000-0000-0000-0000-0000000000a1'),
  'retry resets the row to pending with a fresh attempt count');
select t.ok(public.retry_notification_delivery(gen_random_uuid())->>'code' = 'NOT_MODIFIABLE',
  'retrying a row that is not failed is refused');
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2","email":"q@x.test","role":"authenticated"}', false);
set role authenticated;
select t.ok(not exists (select 1 from public.notification_deliveries where recipient_id = '00000000-0000-0000-0000-0000000000a1'),
  'patients still only see their own deliveries');
select t.ok(public.retry_notification_delivery(gen_random_uuid())->>'code' = 'FORBIDDEN',
  'patients cannot retry deliveries');
reset role;

-- =================================================================== hospital info + settings
reset role;
select set_config('request.jwt.claims', '', false);
set role anon;
select t.ok((select name from public.hospital_info where id = 1) = 'FAME Hospital',
  'signed-out visitors can read hospital info');
reset role;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2","email":"q@x.test","role":"authenticated"}', false);
set role authenticated;
do $$ declare n int; begin
  update public.hospital_info set phone = '+234 1 000 0000' where id = 1;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: patient updated hospital info'; end if;
  raise notice 'PASS: patients cannot change hospital info';
end $$;
select t.ok(not exists (select 1 from public.check_in_secret), 'patients cannot read the check-in code');
select t.ok(public.rotate_check_in_code()->>'code' = 'FORBIDDEN', 'patients cannot rotate the check-in code');
do $$ declare n int; begin
  update public.hospital_settings set booking_window_days = 5 where id = 1;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: patient changed settings'; end if;
  raise notice 'PASS: patients cannot change platform settings';
end $$;
reset role;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ad","email":"a@x.test","role":"authenticated"}', false);
set role authenticated;
update public.hospital_info
set phone = ' +234 (1) 555-0100 ', email = ' Desk@FAME.example ', address = '1 Hospital Road'
where id = 1;
select t.ok((select phone = '+234 (1) 555-0100' and email = 'desk@fame.example' from public.hospital_info),
  'admin updates hospital info (trimmed, email lower-cased)');
reset role;
select t.ok((select updated_by from public.hospital_info) = '00000000-0000-0000-0000-0000000000ad', 'hospital info records who changed it');
set role anon;
do $$ begin
  begin
    perform updated_by from public.hospital_info;
    raise exception 'FAIL: anon read hospital_info.updated_by';
  exception when insufficient_privilege then raise notice 'PASS: who edited hospital info is not public'; end;
end $$;
reset role;
set role authenticated;
do $$ begin
  begin
    update public.hospital_info set email = 'not-an-email' where id = 1;
    raise exception 'FAIL: invalid email accepted';
  exception when check_violation then raise notice 'PASS: invalid hospital email is rejected'; end;
  begin
    update public.hospital_info set website = 'http://insecure.example' where id = 1;
    raise exception 'FAIL: http website accepted';
  exception when check_violation then raise notice 'PASS: hospital website must be https'; end;
  begin
    update public.hospital_settings set booking_window_days = 0 where id = 1;
    raise exception 'FAIL: zero booking window accepted';
  exception when check_violation then raise notice 'PASS: booking window must be at least a day'; end;
end $$;
select t.ok(exists (select 1 from public.admin_audit_log where action = 'hospital_info_updated'
                    and metadata->'fields' ? 'phone'),
  'hospital info changes are audited with the changed fields');
select t.ok((select code from public.check_in_secret) ~ '^[A-Z2-9]{6}$', 'admin reads the 6-character check-in code');
create temp table old_code as select code from public.check_in_secret;
grant select on old_code to public;
select t.ok((public.rotate_check_in_code()->>'success')::boolean, 'admin rotates the check-in code');
select t.ok((select code from public.check_in_secret) <> (select code from old_code), 'rotating issues a new code');
select t.ok(exists (select 1 from public.admin_audit_log where action = 'check_in_code_rotated'),
  'rotating the check-in code is audited');
reset role;

-- =================================================================== queue: setup
-- P2/P3 patients, D3 doctor (made directly by the owner).
reset role;
select set_config('request.jwt.claims', '', false);
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000c1', 'p2@x.test', '{"full_name":"Pia"}'),
  ('00000000-0000-0000-0000-0000000000c2', 'p3@x.test', '{"full_name":"Remi"}'),
  ('00000000-0000-0000-0000-0000000000d3', 'd3@x.test', '{"full_name":"Doc Three"}');
update public.profiles set role = 'doctor' where id = '00000000-0000-0000-0000-0000000000d3';
insert into public.doctors (id, specialty) values ('00000000-0000-0000-0000-0000000000d3', 'GP');
insert into public.beneficiaries (id, account_holder_id, display_name, relationship, dob, gender) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000c1', 'Pia', 'self', '1990-01-01', 'female'),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000c2', 'Remi', 'self', '1990-01-01', 'male');
update public.hospital_settings set time_zone = current_setting('TimeZone'), check_in_opens_minutes = 120 where id = 1;
insert into public.clinic_sessions (id, doctor_id, session_date, start_time, end_time, capacity) values
  -- today, all day (check-in open)
  ('00000000-0000-0000-0000-0000000006a1', '00000000-0000-0000-0000-0000000000d3', current_date, '00:00', '23:59:59', 10),
  -- in two days (check-in not open yet)
  ('00000000-0000-0000-0000-0000000006a2', '00000000-0000-0000-0000-0000000000d3', current_date + 2, '09:00', '12:00', 10),
  -- in 20 days, one place (waitlist)
  ('00000000-0000-0000-0000-0000000006a3', '00000000-0000-0000-0000-0000000000d3', current_date + 20, '09:00', '12:00', 1),
  -- 200 days ahead (outside a 60-day booking window)
  ('00000000-0000-0000-0000-0000000006a4', '00000000-0000-0000-0000-0000000000d3', current_date + 200, '09:00', '12:00', 5),
  -- yesterday (over: automatic no-show)
  ('00000000-0000-0000-0000-0000000006a5', '00000000-0000-0000-0000-0000000000d3', current_date - 1, '09:00', '10:00', 5);
-- Yesterday's booking that never checked in.
insert into public.appointments (id, patient_id, account_holder_id, beneficiary_id, doctor_id, session_id, appointment_date, start_time, status, appointment_type)
values ('00000000-0000-0000-0000-0000000007a5', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c1',
        '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000d3',
        '00000000-0000-0000-0000-0000000006a5', current_date - 1, '09:00', 'confirmed', 'in-clinic');
create temp table ids (k text primary key, v uuid);
grant all on ids to public;
update public.hospital_settings set booking_window_days = 60 where id = 1;

-- =================================================================== booking window
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","email":"p2@x.test","role":"authenticated"}', false);
set role authenticated;
select t.ok(public.book_session('00000000-0000-0000-0000-0000000006a4', '00000000-0000-0000-0000-0000000000e1')->>'code' = 'OUTSIDE_BOOKING_WINDOW',
  'booking beyond the booking window is refused');
select t.ok(not (select is_bookable from public.clinic_session_availability where session_id = '00000000-0000-0000-0000-0000000006a4'),
  'sessions beyond the booking window are not bookable');

-- =================================================================== check-in
insert into ids values ('p2_today', (public.book_session('00000000-0000-0000-0000-0000000006a1', '00000000-0000-0000-0000-0000000000e1')->>'appointment_id')::uuid);
insert into ids values ('p2_later', (public.book_session('00000000-0000-0000-0000-0000000006a2', '00000000-0000-0000-0000-0000000000e1')->>'appointment_id')::uuid);
select t.ok((select source from public.appointments where id = (select v from ids where k = 'p2_today')) = 'patient',
  'patient bookings are marked source=patient');
select t.ok(public.check_in_visit((select v from ids where k = 'p2_today'), 'WRONG1')->>'code' = 'WRONG_CODE',
  'check-in with the wrong code fails');
reset role;
create temp table code as select code from public.check_in_secret;
grant select on code to public;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","email":"p2@x.test","role":"authenticated"}', false);
set role authenticated;
select t.ok(public.check_in_visit((select v from ids where k = 'p2_later'), (select code from code))->>'code' = 'CHECK_IN_NOT_OPEN',
  'check-in before the window opens is refused');
select t.ok((public.check_in_visit((select v from ids where k = 'p2_today'), lower((select code from code)))->>'queue_number')::int = 1,
  'patient checks in with the code (case-insensitive) and gets queue number 1');
select t.ok((public.check_in_visit((select v from ids where k = 'p2_today'), 'anything')->>'already')::boolean,
  'checking in twice is harmless');
select t.ok(public.move_session_booking((select v from ids where k = 'p2_today'), '00000000-0000-0000-0000-0000000006a2')->>'code' = 'NOT_MODIFIABLE',
  'a checked-in booking cannot be moved');
select t.ok(public.advance_visit((select v from ids where k = 'p2_today'), 'call')->>'code' = 'FORBIDDEN',
  'patients cannot call themselves in');
reset role;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c2","email":"p3@x.test","role":"authenticated"}', false);
set role authenticated;
insert into ids values ('p3_today', (public.book_session('00000000-0000-0000-0000-0000000006a1', '00000000-0000-0000-0000-0000000000e2')->>'appointment_id')::uuid);
select t.ok(public.check_in_visit((select v from ids where k = 'p2_today'), (select code from code))->>'code' = 'FORBIDDEN',
  'a patient cannot check in someone else''s booking');
select t.ok(public.get_queue_status((select v from ids where k = 'p2_today'))->>'code' = 'FORBIDDEN',
  'a patient cannot see someone else''s queue status');
reset role;

-- Doctor marks P3 arrived (no code needed).
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d3","email":"d3@x.test","role":"authenticated"}', false);
set role authenticated;
select t.ok((public.advance_visit((select v from ids where k = 'p3_today'), 'arrive')->>'queue_number')::int = 2,
  'doctor marks a patient arrived without the code (queue number 2)');
select t.ok((select waiting = 2 and booked = 2 and not_arrived = 0 from public.clinic_session_progress
             where session_id = '00000000-0000-0000-0000-0000000006a1'),
  'session progress counts two waiting');
do $$ begin
  begin
    update public.appointments set queue_number = 99 where id = (select v from ids where k = 'p3_today');
    raise exception 'FAIL: doctor edited queue number directly';
  exception when insufficient_privilege then raise notice 'PASS: doctors cannot edit queue fields directly'; end;
end $$;
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c2","email":"p3@x.test","role":"authenticated"}', false);
set role authenticated;
select t.ok((public.get_queue_status((select v from ids where k = 'p3_today'))->>'position')::int = 2,
  'P3 is second in line');
select t.ok(not exists (select 1 from public.clinic_session_progress), 'patients cannot read session progress');
reset role;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","email":"d@x.test","role":"authenticated"}', false);
set role authenticated;
select t.ok(public.call_next_in_queue('00000000-0000-0000-0000-0000000006a1')->>'code' = 'FORBIDDEN',
  'another doctor cannot call patients from this session');
reset role;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d3","email":"d3@x.test","role":"authenticated"}', false);
set role authenticated;
select t.ok(public.call_next_in_queue('00000000-0000-0000-0000-0000000006a1')->>'appointment_id' = (select v from ids where k = 'p2_today')::text,
  'call next calls the first to arrive');
reset role;
select t.ok((select array_agg(channel order by channel) from public.notification_deliveries
             where appointment_id = (select v from ids where k = 'p2_today') and event_type = 'queue_called') = array['push', 'sms'],
  'the called patient gets a push and an SMS');
select t.ok((select array_agg(channel) from public.notification_deliveries
             where appointment_id = (select v from ids where k = 'p3_today') and event_type = 'queue_next') = array['push'],
  'the next patient gets a "you''re next" push');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c2","email":"p3@x.test","role":"authenticated"}', false);
set role authenticated;
create temp table qs as select public.get_queue_status((select v from ids where k = 'p3_today')) as q;
select t.ok((select (q->>'position')::int = 1 and (q->>'now_serving')::int = 1 from qs),
  'P3 is now first in line and number 1 is being seen');
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d3","email":"d3@x.test","role":"authenticated"}', false);
set role authenticated;
select t.ok(public.advance_visit((select v from ids where k = 'p2_today'), 'no_show')->>'code' = 'NOT_MODIFIABLE',
  'a patient who was called cannot be marked a no-show');
select t.ok((public.advance_visit((select v from ids where k = 'p2_today'), 'complete')->>'success')::boolean,
  'doctor marks the visit done');
select t.ok((select status = 'completed' and finished_at is not null from public.appointments where id = (select v from ids where k = 'p2_today')),
  'finished visits are completed with a finish time');
select t.ok(public.call_next_in_queue('00000000-0000-0000-0000-0000000006a1')->>'appointment_id' = (select v from ids where k = 'p3_today')::text,
  'call next moves on to the second patient');
select t.ok((public.advance_visit((select v from ids where k = 'p3_today'), 'requeue')->>'success')::boolean,
  'a mistaken call can be undone');
select t.ok((select called_at is null from public.appointments where id = (select v from ids where k = 'p3_today')),
  'undoing a call puts the patient back in line');
select t.ok(public.advance_visit((select v from ids where k = 'p2_later'), 'no_show')->>'code' = 'TOO_EARLY',
  'a future visit cannot be marked a no-show');
select t.ok(public.call_next_in_queue('00000000-0000-0000-0000-0000000006a2')->>'code' = 'QUEUE_EMPTY',
  'call next on an empty queue says so');

do $$ begin
  begin
    update public.appointments set finished_at = now() - interval '5 hours' where id = (select v from ids where k = 'p2_today');
    raise exception 'FAIL: doctor edited finished_at directly';
  exception when insufficient_privilege then raise notice 'PASS: doctors cannot rewrite visit timings directly'; end;
  begin
    update public.appointments set status = 'completed' where id = (select v from ids where k = 'p2_later');
    raise exception 'FAIL: doctor completed a future visit directly';
  exception when insufficient_privilege then raise notice 'PASS: doctors cannot mark a future visit seen directly'; end;
end $$;

-- =================================================================== follow-ups
select t.ok((public.book_follow_up((select v from ids where k = 'p2_today'), '00000000-0000-0000-0000-0000000006a4', 'Review results')->>'success')::boolean,
  'doctor books a follow-up (even beyond the patient booking window)');
reset role;
select t.ok((select source = 'follow_up' and booked_by = '00000000-0000-0000-0000-0000000000d3' and follow_up_of = (select v from ids where k = 'p2_today')
                    and account_holder_id = '00000000-0000-0000-0000-0000000000c1' and reason = 'Review results'
             from public.appointments where session_id = '00000000-0000-0000-0000-0000000006a4'),
  'follow-up is linked to the original visit and patient');
select t.ok(exists (select 1 from public.notification_deliveries d join public.appointments a on a.id = d.appointment_id
                    where a.session_id = '00000000-0000-0000-0000-0000000006a4' and d.event_type = 'follow_up_booked'),
  'the patient is told about the follow-up');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","email":"d@x.test","role":"authenticated"}', false);
set role authenticated;
select t.ok(public.book_follow_up((select v from ids where k = 'p2_today'), '00000000-0000-0000-0000-0000000006a2')->>'code' = 'FORBIDDEN',
  'another doctor cannot book follow-ups for this visit');
reset role;

-- =================================================================== waitlist
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","email":"p2@x.test","role":"authenticated"}', false);
set role authenticated;
select t.ok(public.join_waitlist('00000000-0000-0000-0000-0000000006a3', '00000000-0000-0000-0000-0000000000e1')->>'code' = 'SESSION_HAS_PLACES',
  'no waitlist while a session has places');
insert into ids values ('p2_full', (public.book_session('00000000-0000-0000-0000-0000000006a3', '00000000-0000-0000-0000-0000000000e1')->>'appointment_id')::uuid);
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c2","email":"p3@x.test","role":"authenticated"}', false);
set role authenticated;
select t.ok((public.join_waitlist('00000000-0000-0000-0000-0000000006a3', '00000000-0000-0000-0000-0000000000e2', 'cough')->>'position')::int = 1,
  'patient joins the waitlist of a full session (first in line)');
select t.ok(public.join_waitlist('00000000-0000-0000-0000-0000000006a3', '00000000-0000-0000-0000-0000000000e2')->>'code' = 'ALREADY_WAITING',
  'cannot join the same waitlist twice');
select t.ok((select position = 1 from public.my_waitlist_entries where session_id = '00000000-0000-0000-0000-0000000006a3'),
  'patient sees their waitlist place');
select t.ok((select waitlist_count = 1 from public.clinic_session_availability where session_id = '00000000-0000-0000-0000-0000000006a3'),
  'availability shows how many are waiting');
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","email":"p2@x.test","role":"authenticated"}', false);
set role authenticated;
select t.ok(not exists (select 1 from public.session_waitlist), 'patients cannot see other people''s waitlist entries');
select t.ok((public.cancel_appointment((select v from ids where k = 'p2_full'))->>'success')::boolean, 'P2 cancels the only place');
reset role;
select t.ok((select status = 'booked' and appointment_id is not null from public.session_waitlist
             where session_id = '00000000-0000-0000-0000-0000000006a3' and beneficiary_id = '00000000-0000-0000-0000-0000000000e2'),
  'the freed place goes to the first person waiting');
select t.ok((select source = 'waitlist' and status = 'confirmed' and reason = 'cough' from public.appointments
             where session_id = '00000000-0000-0000-0000-0000000006a3' and beneficiary_id = '00000000-0000-0000-0000-0000000000e2'),
  'the waitlist booking is confirmed with their reason');
select t.ok(exists (select 1 from public.notification_deliveries d join public.appointments a on a.id = d.appointment_id
                    where a.session_id = '00000000-0000-0000-0000-0000000006a3' and d.event_type = 'waitlist_booked'),
  'they are told they got the place');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","email":"p2@x.test","role":"authenticated"}', false);
set role authenticated;
insert into ids values ('p2_wait', (public.join_waitlist('00000000-0000-0000-0000-0000000006a3', '00000000-0000-0000-0000-0000000000e1')->>'entry_id')::uuid);
select t.ok((public.leave_waitlist((select v from ids where k = 'p2_wait'))->>'success')::boolean, 'patient leaves a waitlist');
select t.ok(public.leave_waitlist((select v from ids where k = 'p2_wait'))->>'code' = 'NOT_MODIFIABLE', 'leaving twice is refused');
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c2","email":"p3@x.test","role":"authenticated"}', false);
set role authenticated;
select t.ok(public.leave_waitlist((select v from ids where k = 'p2_wait'))->>'code' = 'NOT_FOUND', 'cannot leave someone else''s waitlist entry');
reset role;

-- =================================================================== housekeeping
reset role;
select set_config('request.jwt.claims', '', false);
update public.hospital_settings set auto_no_show = true, no_show_after_minutes = 0 where id = 1;
-- Yesterday: one patient called in but never marked done, one checked in and never called.
insert into public.appointments (id, patient_id, account_holder_id, beneficiary_id, doctor_id, session_id, appointment_date, start_time, status, appointment_type, checked_in_at, queue_number, called_at)
values
  ('00000000-0000-0000-0000-0000000007b1', '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000c2',
   '00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000d3',
   '00000000-0000-0000-0000-0000000006a5', current_date - 1, '09:00', 'confirmed', 'in-clinic', now() - interval '1 day', 1, now() - interval '1 day'),
  ('00000000-0000-0000-0000-0000000007b2', '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a2',
   '00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000d3',
   '00000000-0000-0000-0000-0000000006a5', current_date - 1, '09:00', 'confirmed', 'in-clinic', now() - interval '1 day', 2, null);
select t.ok((public.run_visit_housekeeping()->>'no_shows')::int >= 1, 'housekeeping runs');
select t.ok((select status = 'no_show' from public.appointments where id = '00000000-0000-0000-0000-0000000007a5'),
  'a booked patient who never arrived becomes a no-show after the session');
select t.ok(exists (select 1 from public.notification_deliveries
                    where appointment_id = '00000000-0000-0000-0000-0000000007a5' and event_type = 'visit_missed'),
  'the patient is told they missed the visit');
select t.ok((select status from public.appointments where id = (select v from ids where k = 'p3_today')) = 'confirmed',
  'visits in a session that is still running are left open');
select t.ok((select status from public.appointments where id = '00000000-0000-0000-0000-0000000007b1') = 'completed',
  'a patient called in but never marked done is marked seen after the session');
select t.ok((select status from public.appointments where id = '00000000-0000-0000-0000-0000000007b2') = 'no_show',
  'a patient who checked in but was never called is a no-show after the session');
select t.ok(public.run_visit_housekeeping() ? 'reminders_evening', 'housekeeping reports reminder counts');
update public.hospital_settings set reminders_enabled = false where id = 1;
select t.ok((public.run_visit_housekeeping()->>'reminders_morning')::int = 0
  and (public.run_visit_housekeeping()->>'reminders_evening')::int = 0,
  'no reminders when they are switched off');
update public.hospital_settings set reminders_enabled = true where id = 1;
select t.ok(not has_function_privilege('authenticated', 'public.run_visit_housekeeping()', 'execute'),
  'clients cannot run housekeeping');

-- =================================================================== reports
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ad","email":"a@x.test","role":"authenticated"}', false);
set role authenticated;
create temp table rep as select public.visit_report(current_date - 7, current_date + 7) as j;
grant select on rep to public;
select t.ok(((select j from rep)->>'success')::boolean, 'admin runs the visit report');
select t.ok(((select j from rep)->'totals'->>'seen')::int >= 1 and ((select j from rep)->'totals'->>'no_show')::int >= 1,
  'report counts seen visits and no-shows');
select t.ok(jsonb_array_length((select j from rep)->'doctors') >= 1 and jsonb_array_length((select j from rep)->'days') >= 1,
  'report breaks down by doctor and by day');
select t.ok(public.visit_report(current_date, current_date - 1)->>'code' = 'INVALID_INPUT', 'report rejects a backwards range');
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d3","email":"d3@x.test","role":"authenticated"}', false);
set role authenticated;
select t.ok(public.visit_report(current_date - 7, current_date)->>'code' = 'FORBIDDEN', 'doctors cannot run the admin report');
reset role;

-- =================================================================== rewritten policies (query performance)
-- Same visibility as before the policies were rewritten to evaluate the
-- caller once per query.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","email":"d@x.test","role":"authenticated"}', false);
set role authenticated;
select t.ok(exists (select 1 from public.beneficiaries where id = '00000000-0000-0000-0000-0000000000b1'),
  'doctor reads the family record of a patient booked with them');
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d2","email":"d2@x.test","role":"authenticated"}', false);
set role authenticated;
select t.ok(not exists (select 1 from public.beneficiaries where id = '00000000-0000-0000-0000-0000000000b1'),
  'another doctor cannot read that family record');
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ad","email":"a@x.test","role":"authenticated"}', false);
set role authenticated;
select t.ok(exists (select 1 from public.profiles where id = '00000000-0000-0000-0000-0000000000a1')
    and exists (select 1 from public.beneficiaries where id = '00000000-0000-0000-0000-0000000000b1')
    and exists (select 1 from public.appointments where account_holder_id = '00000000-0000-0000-0000-0000000000a1'),
  'admin still reads every profile, family record and visit');
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2","email":"q@x.test","role":"authenticated"}', false);
set role authenticated;
select t.ok(not exists (select 1 from public.appointments where account_holder_id = '00000000-0000-0000-0000-0000000000a1')
    and not exists (select 1 from public.beneficiaries where id = '00000000-0000-0000-0000-0000000000b1'),
  'a patient cannot read another account''s visits or family records');
reset role;
select set_config('request.jwt.claims', '', false);
set role anon;
select t.ok(
  (select count(*) from public.profiles) = 0
  and (select count(*) from public.appointments) = 0
  and (select count(*) from public.beneficiaries) = 0
  and (select count(*) from public.doctors) = 0
  and (select count(*) from public.notification_deliveries) = 0,
  'signed-out visitors read no profiles, visits, family records, doctors or deliveries');
reset role;

\echo ALL TESTS PASSED
