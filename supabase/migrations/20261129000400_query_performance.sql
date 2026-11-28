-- =========================================================================
-- Query performance
-- Runs after 20261129000300_visit_reports.sql.
--
-- Measured on a seeded copy (40k patients, 16k sessions, 237k visits, two
-- years of history). No behaviour changes: every policy, view and index keeps
-- returning the same rows, only cheaper.
--
-- 1. RLS policies evaluate auth.uid() and current_role() once per query
--    instead of once per row. current_role() is SECURITY DEFINER, so Postgres
--    cannot inline it: unwrapped, it ran a profiles lookup for every row an
--    admin listed. Doctor-only EXISTS checks now run only for doctors (they
--    ran one appointments probe per row for admins too). Policies that only
--    ever applied to signed-in users are scoped to `authenticated`, so anon
--    requests skip them.
-- 2. Indexes that match how the app reads: the admin visit list (by date or
--    by status, newest first), the patient search (ILIKE '%term%' needs
--    trigram indexes), the patient's updates feed, and the foreign keys that
--    account deletion and cascades probe. Two indexes superseded by the new
--    ones are dropped.
-- 3. Views: the hospital clock and booking window are read once per query,
--    not per session row; doctor_next_open_session only scans sessions inside
--    the booking window instead of the whole history.
--
-- Idempotent: safe to re-run.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. RLS policies
--
-- Dropped and recreated (not ALTERed) so this also works on databases that
-- drifted from the migration files, e.g. ones set up by pasting files into
-- the SQL Editor that skipped 20260319000000_doctor_appointment_context.sql:
-- any policy missing there is created here with its intended rule. Each
-- drop/create pair runs in the migration's transaction, so there is never a
-- moment without the policy.
-- -------------------------------------------------------------------------

-- admin_audit_log
drop policy if exists "Admins read audit log" on public.admin_audit_log;
create policy "Admins read audit log" on public.admin_audit_log
  for select
  to authenticated
  using ((select public.current_role()) = 'admin');

-- appointments
drop policy if exists "Admins manage all appointments" on public.appointments;
create policy "Admins manage all appointments" on public.appointments
  for all
  to authenticated
  using ((select public.current_role()) = 'admin');

drop policy if exists "Doctors view own appointments" on public.appointments;
create policy "Doctors view own appointments" on public.appointments
  for select
  to authenticated
  using (doctor_id = (select auth.uid()));

drop policy if exists "Patients view own appointments" on public.appointments;
create policy "Patients view own appointments" on public.appointments
  for select
  to authenticated
  using (
    patient_id = (select auth.uid())
    or account_holder_id = (select auth.uid())
  );

drop policy if exists "Doctors update own appointments" on public.appointments;
create policy "Doctors update own appointments" on public.appointments
  for update
  to authenticated
  using (doctor_id = (select auth.uid()));

-- beneficiaries
drop policy if exists "Account holders manage beneficiaries" on public.beneficiaries;
create policy "Account holders manage beneficiaries" on public.beneficiaries
  for all
  to authenticated
  using (account_holder_id = (select auth.uid()))
  with check (account_holder_id = (select auth.uid()));

drop policy if exists "Admins view all beneficiaries" on public.beneficiaries;
create policy "Admins view all beneficiaries" on public.beneficiaries
  for select
  to authenticated
  using ((select public.current_role()) = 'admin');

drop policy if exists "Doctors view appointment beneficiaries" on public.beneficiaries;
create policy "Doctors view appointment beneficiaries" on public.beneficiaries
  for select
  to authenticated
  using (
    (select public.current_role()) = 'doctor'
    and exists (
      select 1
      from public.appointments a
      where a.doctor_id = (select auth.uid())
        and a.beneficiary_id = beneficiaries.id
    )
  );

-- check_in_secret
drop policy if exists "Admins read check-in code" on public.check_in_secret;
create policy "Admins read check-in code" on public.check_in_secret
  for select
  to authenticated
  using ((select public.current_role()) = 'admin');

-- doctor_invites
drop policy if exists "Admins manage all doctor_invites" on public.doctor_invites;
create policy "Admins manage all doctor_invites" on public.doctor_invites
  for all
  to authenticated
  using ((select public.current_role()) = 'admin');

-- doctors
drop policy if exists "Admins can manage doctors" on public.doctors;
create policy "Admins can manage doctors" on public.doctors
  for all
  to authenticated
  using ((select public.current_role()) = 'admin');

-- Was `auth.role() = 'authenticated'` for every role; the role scope says it.
drop policy if exists "Anyone authenticated can view doctors" on public.doctors;
create policy "Anyone authenticated can view doctors" on public.doctors
  for select
  to authenticated
  using (true);

drop policy if exists "Doctors can update own record" on public.doctors;
create policy "Doctors can update own record" on public.doctors
  for update
  to authenticated
  using (id = (select auth.uid()));

-- hospital_info
drop policy if exists "Admins update hospital info" on public.hospital_info;
create policy "Admins update hospital info" on public.hospital_info
  for update
  to authenticated
  using ((select public.current_role()) = 'admin')
  with check ((select public.current_role()) = 'admin');

-- hospital_settings
drop policy if exists "Authenticated read settings" on public.hospital_settings;
create policy "Authenticated read settings" on public.hospital_settings
  for select
  to authenticated
  using (true);

drop policy if exists "Admins update settings" on public.hospital_settings;
create policy "Admins update settings" on public.hospital_settings
  for update
  to authenticated
  using ((select public.current_role()) = 'admin');

-- notification_deliveries
drop policy if exists "Admins read notification deliveries" on public.notification_deliveries;
create policy "Admins read notification deliveries" on public.notification_deliveries
  for select
  to authenticated
  using ((select public.current_role()) = 'admin');

drop policy if exists "Recipients view own notification deliveries" on public.notification_deliveries;
create policy "Recipients view own notification deliveries" on public.notification_deliveries
  for select
  to authenticated
  using (recipient_id = (select auth.uid()));

-- notification_preferences
drop policy if exists "Users manage own notification preferences" on public.notification_preferences;
create policy "Users manage own notification preferences" on public.notification_preferences
  for all
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- profiles
drop policy if exists "Admins can view all profiles" on public.profiles;
create policy "Admins can view all profiles" on public.profiles
  for select
  to authenticated
  using ((select public.current_role()) = 'admin');

drop policy if exists "Doctors view appointment holder profiles" on public.profiles;
create policy "Doctors view appointment holder profiles" on public.profiles
  for select
  to authenticated
  using (
    (select public.current_role()) = 'doctor'
    and exists (
      select 1
      from public.appointments a
      where a.doctor_id = (select auth.uid())
        and (a.account_holder_id = profiles.id or a.patient_id = profiles.id)
    )
  );

drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile" on public.profiles
  for select
  to authenticated
  using (id = (select auth.uid()));

drop policy if exists "Admins can update any profile" on public.profiles;
create policy "Admins can update any profile" on public.profiles
  for update
  to authenticated
  using ((select public.current_role()) = 'admin');

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile" on public.profiles
  for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- push_device_tokens
drop policy if exists "Users manage own push tokens" on public.push_device_tokens;
create policy "Users manage own push tokens" on public.push_device_tokens
  for all
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- session_waitlist
drop policy if exists "Holders read own waitlist entries" on public.session_waitlist;
create policy "Holders read own waitlist entries" on public.session_waitlist
  for select
  to authenticated
  using (account_holder_id = (select auth.uid()));

drop policy if exists "Staff read waitlists" on public.session_waitlist;
create policy "Staff read waitlists" on public.session_waitlist
  for select
  to authenticated
  using (
    (select public.current_role()) = 'admin'
    or (
      (select public.current_role()) = 'doctor'
      and exists (
        select 1
        from public.clinic_sessions s
        where s.id = session_waitlist.session_id
          and s.doctor_id = (select auth.uid())
      )
    )
  );

-- -------------------------------------------------------------------------
-- 2. Indexes
-- -------------------------------------------------------------------------

-- Admin visit list: newest first (or soonest first for "Upcoming"), paged
-- with offset, so the order needs a unique tiebreak (id): every visit in a
-- session shares its date and start time.
create index if not exists appointments_date_time_idx
  on public.appointments (appointment_date, start_time, id);

-- The same list filtered by status (No-shows, Cancelled); also serves the
-- reminder sweep (confirmed visits on one date).
create index if not exists appointments_status_date_time_idx
  on public.appointments (status, appointment_date, start_time, id);

-- Superseded: the report's date range uses appointments_date_time_idx, the
-- reminder sweep uses appointments_status_date_time_idx.
drop index if exists public.appointments_date_status_idx;
drop index if exists public.appointments_reminder_due_idx;

-- Foreign keys probed by ON DELETE SET NULL / CASCADE (account deletion,
-- removing a family member, deleting a visit). Partial: most rows are null.
create index if not exists appointments_follow_up_of_idx
  on public.appointments (follow_up_of) where follow_up_of is not null;
create index if not exists appointments_booked_by_idx
  on public.appointments (booked_by) where booked_by is not null;
create index if not exists notification_deliveries_appointment_idx
  on public.notification_deliveries (appointment_id) where appointment_id is not null;
create index if not exists admin_audit_log_actor_idx
  on public.admin_audit_log (actor_id) where actor_id is not null;
create index if not exists clinic_sessions_created_by_idx
  on public.clinic_sessions (created_by) where created_by is not null;
create index if not exists session_waitlist_beneficiary_idx
  on public.session_waitlist (beneficiary_id);
create index if not exists session_waitlist_appointment_idx
  on public.session_waitlist (appointment_id) where appointment_id is not null;
-- doctor_invites and hospital_info stay unindexed on purpose: a handful of
-- rows, a sequential scan is cheaper than maintaining an index.

-- Updates feed: a user's newest deliveries. Replaces the recipient-only index.
create index if not exists notification_deliveries_recipient_created_idx
  on public.notification_deliveries (recipient_id, created_at desc);
drop index if exists public.notification_deliveries_recipient_idx;

-- Admin patient list: newest patients first.
create index if not exists profiles_role_created_idx
  on public.profiles (role, created_at desc);

-- Admin patient search matches anywhere in the name, phone or hospital file
-- number (ILIKE '%term%'), which a btree cannot serve. Trigram GIN indexes
-- can, for terms of three or more characters.
create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;

do $$
declare
  -- Wherever pg_trgm already lives (Supabase: extensions; older projects
  -- may have it in public).
  v_schema text := (
    select n.nspname
    from pg_extension e
    join pg_namespace n on n.oid = e.extnamespace
    where e.extname = 'pg_trgm'
  );
begin
  execute format(
    'create index if not exists profiles_full_name_trgm_idx on public.profiles using gin (full_name %I.gin_trgm_ops)',
    v_schema
  );
  execute format(
    'create index if not exists profiles_phone_trgm_idx on public.profiles using gin (phone %I.gin_trgm_ops)',
    v_schema
  );
  execute format(
    'create index if not exists beneficiaries_hospital_file_id_trgm_idx on public.beneficiaries using gin (hospital_file_id %I.gin_trgm_ops)',
    v_schema
  );
end;
$$;

-- -------------------------------------------------------------------------
-- 3. Views
-- -------------------------------------------------------------------------

-- Same columns as before; hospital_now() and booking_window_end() are
-- SECURITY DEFINER lookups of hospital_settings, so they are wrapped in
-- scalar sub-selects to run once per query rather than twice per session.
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
    and (s.session_date + s.end_time) > (select public.hospital_now())
    and s.session_date <= (select public.booking_window_end())
    and coalesce(b.booked, 0) < s.capacity
  ) as is_bookable,
  s.room,
  coalesce(w.waiting, 0)::int as waitlist_count,
  (
    s.status = 'scheduled'
    and (s.session_date + s.end_time) > (select public.hospital_now())
    and s.session_date <= (select public.booking_window_end())
  ) as in_booking_window
from public.clinic_sessions s
left join lateral (
  select count(*) as booked
  from public.appointments a
  where a.session_id = s.id and a.status <> 'cancelled'
) b on true
left join lateral (
  select count(*) as waiting
  from public.session_waitlist q
  where q.session_id = s.id and q.status = 'waiting'
) w on true
where (select public.is_active_user());

revoke all on public.clinic_session_availability from public, anon;
grant select on public.clinic_session_availability to authenticated;

-- is_bookable already implies these date bounds (a session that ends after
-- now cannot be dated before today); spelling them out lets the planner use
-- clinic_sessions_date_idx instead of reading every past session.
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
  and v.session_date >= (select public.hospital_now())::date
  and v.session_date <= (select public.booking_window_end())
order by v.doctor_id, v.session_date, v.start_time;

revoke all on public.doctor_next_open_session from public, anon;
grant select on public.doctor_next_open_session to authenticated;

create or replace view public.my_waitlist_entries as
select
  w.id,
  w.session_id,
  w.beneficiary_id,
  w.created_at,
  s.doctor_id,
  s.session_date,
  s.start_time,
  s.end_time,
  s.room,
  (
    select count(*)::int
    from public.session_waitlist o
    where o.session_id = w.session_id
      and o.status = 'waiting'
      and (o.created_at, o.id) <= (w.created_at, w.id)
  ) as position
from public.session_waitlist w
join public.clinic_sessions s on s.id = w.session_id
where w.account_holder_id = (select auth.uid())
  and w.status = 'waiting'
  and (select public.is_active_user());

revoke all on public.my_waitlist_entries from public, anon;
grant select on public.my_waitlist_entries to authenticated;
