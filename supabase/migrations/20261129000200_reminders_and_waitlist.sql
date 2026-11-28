-- =========================================================================
-- Visit reminders, automatic no-shows and session waitlists
-- Runs after 20261129000100_visit_queue.sql.
--
--   * run_visit_housekeeping() (every 10 minutes via pg_cron) sends
--       - a reminder the evening before (from reminder_evening_hour, for
--         3 hours) and on the morning of the visit (from
--         reminder_morning_hour until the session starts),
--       - once a session ended no_show_after_minutes ago (if auto_no_show is
--         on): booked patients who never checked in become no-shows; anyone
--         called in but never marked done is marked seen; anyone checked in
--         but never called becomes a no-show (they left before being seen),
--       - closes waitlists of sessions that started or were cancelled.
--     Each reminder is sent once per booking; moving a booking resets them.
--   * session_waitlist: when a session is full a patient can join its
--     waitlist (until it starts). When a place frees up before the session
--     starts (cancellation, a booking moved away, a bigger patient limit) the
--     first person waiting is booked automatically and told so.
--   * delete_my_account leaves the user's waitlists before cancelling their
--     visits, so freed places go to other people.
--   * The availability views respect the booking window and show how many
--     people are waiting.
--
-- pg_cron: enable it (Dashboard → Database → Extensions) and re-run this
-- migration to schedule the job. Without it, nothing is sent automatically.
--
-- Idempotent: safe to re-run.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. Reminder bookkeeping
-- -------------------------------------------------------------------------
-- Moving a booking to another session resets its reminders and queue nudges.
create or replace function public.reset_appointment_reminders()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.session_id is distinct from old.session_id
     or new.appointment_date is distinct from old.appointment_date then
    new.reminder_day_before_at := null;
    new.reminder_same_day_at := null;
    new.next_notified_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists appointments_reset_reminders on public.appointments;
create trigger appointments_reset_reminders
  before update on public.appointments
  for each row execute function public.reset_appointment_reminders();

create index if not exists appointments_reminder_due_idx
  on public.appointments (appointment_date)
  where status = 'confirmed' and session_id is not null;

-- -------------------------------------------------------------------------
-- 2. Waitlist
-- -------------------------------------------------------------------------
create table if not exists public.session_waitlist (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.clinic_sessions(id) on delete cascade,
  beneficiary_id uuid not null references public.beneficiaries(id) on delete cascade,
  account_holder_id uuid not null references public.profiles(id) on delete cascade,
  reason text,
  notes text,
  status text not null default 'waiting'
    check (status in ('waiting', 'booked', 'left', 'expired')),
  appointment_id uuid references public.appointments(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint session_waitlist_reason_length check (char_length(coalesce(reason, '')) <= 200),
  constraint session_waitlist_notes_length check (char_length(coalesce(notes, '')) <= 500)
);

create unique index if not exists session_waitlist_one_waiting
  on public.session_waitlist (session_id, beneficiary_id)
  where status = 'waiting';
create index if not exists session_waitlist_session_idx
  on public.session_waitlist (session_id, created_at)
  where status = 'waiting';
create index if not exists session_waitlist_holder_idx
  on public.session_waitlist (account_holder_id);

alter table public.session_waitlist enable row level security;

drop policy if exists "Holders read own waitlist entries" on public.session_waitlist;
create policy "Holders read own waitlist entries" on public.session_waitlist
  for select to authenticated
  using (account_holder_id = auth.uid());

drop policy if exists "Staff read waitlists" on public.session_waitlist;
create policy "Staff read waitlists" on public.session_waitlist
  for select to authenticated
  using (
    public.current_role() = 'admin'
    or exists (
      select 1 from public.clinic_sessions s
      where s.id = session_id and s.doctor_id = auth.uid()
    )
  );

drop policy if exists "Active accounts only" on public.session_waitlist;
create policy "Active accounts only" on public.session_waitlist
  as restrictive for all to authenticated
  using ((select public.is_active_user()))
  with check ((select public.is_active_user()));

revoke all on public.session_waitlist from anon, authenticated;
grant select on public.session_waitlist to authenticated;

-- Book the first people waiting while the session has places and hasn't
-- started. Callers lock the session before any appointment row.
create or replace function public.promote_waitlist(p_session_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.clinic_sessions%rowtype;
  v_entry public.session_waitlist%rowtype;
  v_doctor public.doctors%rowtype;
  v_booked int;
  v_promoted int := 0;
  v_appt_id uuid;
begin
  if not coalesce((select s.waitlist_enabled from public.hospital_settings s where s.id = 1), true) then
    return 0;
  end if;
  -- Nobody waiting: don't take the session lock at all.
  if not exists (
    select 1 from public.session_waitlist w
    where w.session_id = p_session_id and w.status = 'waiting'
  ) then
    return 0;
  end if;

  select * into v_session from public.clinic_sessions where id = p_session_id for update;
  -- A place that frees up once the clinic has started is too late to offer.
  if not found
     or v_session.status <> 'scheduled'
     or (v_session.session_date + v_session.start_time) <= public.hospital_now() then
    return 0;
  end if;
  select * into v_doctor from public.doctors where id = v_session.doctor_id;
  if not found
     or coalesce(v_doctor.is_active, true) = false
     or v_doctor.is_accepting_bookings = false
     or not coalesce((select p.is_active from public.profiles p where p.id = v_session.doctor_id), false) then
    return 0;
  end if;

  loop
    select count(*) into v_booked
    from public.appointments a
    where a.session_id = p_session_id and a.status <> 'cancelled';
    exit when v_booked >= v_session.capacity;

    select * into v_entry
    from public.session_waitlist w
    where w.session_id = p_session_id and w.status = 'waiting'
    order by w.created_at, w.id
    limit 1
    for update skip locked;
    exit when not found;

    -- The person was removed, their account deactivated, or they got a
    -- place some other way.
    if exists (
         select 1 from public.beneficiaries b
         where b.id = v_entry.beneficiary_id and b.archived_at is not null
       )
       or not coalesce((select p.is_active from public.profiles p where p.id = v_entry.account_holder_id), false)
       or exists (
         select 1 from public.appointments a
         where a.session_id = p_session_id
           and a.beneficiary_id = v_entry.beneficiary_id
           and a.status <> 'cancelled'
       ) then
      update public.session_waitlist
      set status = 'expired', updated_at = now()
      where id = v_entry.id;
      continue;
    end if;

    insert into public.appointments (
      patient_id, account_holder_id, beneficiary_id, doctor_id, session_id,
      appointment_date, start_time, status, appointment_type, reason, notes,
      source, booked_by
    )
    values (
      v_entry.account_holder_id, v_entry.account_holder_id, v_entry.beneficiary_id,
      v_session.doctor_id, p_session_id,
      v_session.session_date, v_session.start_time, 'confirmed', 'in-clinic',
      v_entry.reason, v_entry.notes,
      'waitlist', v_entry.account_holder_id
    )
    returning id into v_appt_id;

    update public.session_waitlist
    set status = 'booked', appointment_id = v_appt_id, updated_at = now()
    where id = v_entry.id;
    v_promoted := v_promoted + 1;
  end loop;

  return v_promoted;
end;
$$;

revoke execute on function public.promote_waitlist(uuid) from public, anon, authenticated;

-- A place freed up: cancelled, or moved to another session.
create or replace function public.promote_waitlist_after_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.session_id is not null
     and old.status <> 'cancelled'
     and (new.status = 'cancelled' or new.session_id is distinct from old.session_id)
     and exists (
       select 1 from public.session_waitlist w
       where w.session_id = old.session_id and w.status = 'waiting'
     ) then
    perform public.promote_waitlist(old.session_id);
  end if;
  return null;
end;
$$;

revoke execute on function public.promote_waitlist_after_change() from public, anon, authenticated;

drop trigger if exists appointments_promote_waitlist on public.appointments;
create trigger appointments_promote_waitlist
  after update on public.appointments
  for each row execute function public.promote_waitlist_after_change();

-- A bigger patient limit frees places too.
create or replace function public.promote_waitlist_after_capacity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.capacity > old.capacity and new.status = 'scheduled' then
    perform public.promote_waitlist(new.id);
  end if;
  if new.status = 'cancelled' and old.status <> 'cancelled' then
    update public.session_waitlist
    set status = 'expired', updated_at = now()
    where session_id = new.id and status = 'waiting';
  end if;
  return null;
end;
$$;

revoke execute on function public.promote_waitlist_after_capacity() from public, anon, authenticated;

drop trigger if exists clinic_sessions_promote_waitlist on public.clinic_sessions;
create trigger clinic_sessions_promote_waitlist
  after update on public.clinic_sessions
  for each row execute function public.promote_waitlist_after_capacity();

create or replace function public.join_waitlist(
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
  v_entry_id uuid;
  v_position int;
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'code', 'NOT_AUTHENTICATED');
  end if;
  perform public.assert_active_caller();

  if not coalesce((select s.waitlist_enabled from public.hospital_settings s where s.id = 1), true) then
    return jsonb_build_object('success', false, 'code', 'WAITLIST_DISABLED');
  end if;
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
  -- Only a full session has a waitlist; anything else is a real error.
  if v_error is null then
    return jsonb_build_object('success', false, 'code', 'SESSION_HAS_PLACES');
  end if;
  if v_error <> 'SESSION_FULL' then
    return jsonb_build_object('success', false, 'code', v_error);
  end if;
  -- Places freed after the start aren't offered, so neither is the waitlist.
  if (v_session.session_date + v_session.start_time) <= public.hospital_now() then
    return jsonb_build_object('success', false, 'code', 'SESSION_UNAVAILABLE');
  end if;
  if v_session.session_date > public.booking_window_end() then
    return jsonb_build_object('success', false, 'code', 'OUTSIDE_BOOKING_WINDOW');
  end if;
  if exists (
    select 1 from public.session_waitlist w
    where w.session_id = p_session_id
      and w.beneficiary_id = p_beneficiary_id
      and w.status = 'waiting'
  ) then
    return jsonb_build_object('success', false, 'code', 'ALREADY_WAITING');
  end if;

  insert into public.session_waitlist (session_id, beneficiary_id, account_holder_id, reason, notes)
  values (
    p_session_id, p_beneficiary_id, v_uid,
    nullif(trim(p_reason), ''), nullif(trim(p_notes), '')
  )
  returning id into v_entry_id;

  select count(*)::int into v_position
  from public.session_waitlist w
  where w.session_id = p_session_id and w.status = 'waiting';

  return jsonb_build_object('success', true, 'entry_id', v_entry_id, 'position', v_position);
end;
$$;

create or replace function public.leave_waitlist(p_entry_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_entry public.session_waitlist%rowtype;
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'code', 'NOT_AUTHENTICATED');
  end if;
  perform public.assert_active_caller();

  select * into v_entry from public.session_waitlist where id = p_entry_id for update;
  if not found or v_entry.account_holder_id <> v_uid then
    return jsonb_build_object('success', false, 'code', 'NOT_FOUND');
  end if;
  if v_entry.status <> 'waiting' then
    return jsonb_build_object('success', false, 'code', 'NOT_MODIFIABLE');
  end if;

  update public.session_waitlist
  set status = 'left', updated_at = now()
  where id = p_entry_id;

  return jsonb_build_object('success', true);
end;
$$;

-- The caller's waitlist entries that are still waiting, with their place.
drop view if exists public.my_waitlist_entries;
create view public.my_waitlist_entries as
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
where w.account_holder_id = auth.uid()
  and w.status = 'waiting'
  and (select public.is_active_user());

revoke all on public.my_waitlist_entries from public, anon;
grant select on public.my_waitlist_entries to authenticated;

-- -------------------------------------------------------------------------
-- 3. Availability views: booking window and waitlist size
-- -------------------------------------------------------------------------
drop view if exists public.clinic_session_availability cascade;
create view public.clinic_session_availability as
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
    and s.session_date <= public.booking_window_end()
    and coalesce(b.booked, 0) < s.capacity
  ) as is_bookable,
  s.room,
  coalesce(w.waiting, 0)::int as waitlist_count,
  (
    s.status = 'scheduled'
    and (s.session_date + s.end_time) > public.hospital_now()
    and s.session_date <= public.booking_window_end()
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
-- 4. Housekeeping (reminders, no-shows, closed waitlists)
-- -------------------------------------------------------------------------
create or replace function public.run_visit_housekeeping()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings public.hospital_settings%rowtype;
  v_now timestamp := public.hospital_now();
  v_hour int := extract(hour from public.hospital_now())::int;
  v_today date := public.hospital_now()::date;
  v_evening int := 0;
  v_morning int := 0;
  v_no_shows int := 0;
  v_expired int := 0;
  r record;
begin
  select * into v_settings from public.hospital_settings where id = 1;

  if coalesce(v_settings.reminders_enabled, true) then
    -- Evening before: from the configured hour, for three hours (not at
    -- night). Skips bookings made in the last hour (they just got a
    -- confirmation).
    if v_hour >= coalesce(v_settings.reminder_evening_hour, 18)
       and v_hour < coalesce(v_settings.reminder_evening_hour, 18) + 3 then
      for r in
        select a.id, public.appointment_patient_recipient(a) as recipient
        from public.appointments a
        join public.clinic_sessions s on s.id = a.session_id
        where a.status = 'confirmed'
          and s.status = 'scheduled'
          and a.appointment_date = v_today + 1
          and a.reminder_day_before_at is null
          and a.created_at < now() - interval '1 hour'
        for update of a skip locked
      loop
        update public.appointments set reminder_day_before_at = now() where id = r.id;
        perform public.enqueue_notification_deliveries(r.id, r.recipient, 'reminder_day_before');
        v_evening := v_evening + 1;
      end loop;
    end if;

    -- Morning of the visit: from the configured hour until the session starts.
    if v_hour >= coalesce(v_settings.reminder_morning_hour, 7) then
      for r in
        select a.id, public.appointment_patient_recipient(a) as recipient
        from public.appointments a
        join public.clinic_sessions s on s.id = a.session_id
        where a.status = 'confirmed'
          and s.status = 'scheduled'
          and a.appointment_date = v_today
          and (s.session_date + s.start_time) > v_now
          and a.checked_in_at is null
          and a.reminder_same_day_at is null
          and a.created_at < now() - interval '1 hour'
        for update of a skip locked
      loop
        update public.appointments set reminder_same_day_at = now() where id = r.id;
        perform public.enqueue_notification_deliveries(r.id, r.recipient, 'reminder_same_day');
        v_morning := v_morning + 1;
      end loop;
    end if;
  end if;

  -- Session over (+ grace): close every visit still open.
  if coalesce(v_settings.auto_no_show, true) then
    -- Called in but never marked done: the doctor saw them.
    update public.appointments a
    set status = 'completed'
    from public.clinic_sessions s
    where s.id = a.session_id
      and s.status = 'scheduled'
      and a.status = 'confirmed'
      and a.called_at is not null
      and (s.session_date + s.end_time)
          + make_interval(mins => coalesce(v_settings.no_show_after_minutes, 30)) <= v_now
      and s.session_date >= v_today - 7;

    -- Booked (or checked in and never called): no-show.
    with missed as (
      update public.appointments a
      set status = 'no_show'
      from public.clinic_sessions s
      where s.id = a.session_id
        and s.status = 'scheduled'
        and a.status = 'confirmed'
        and a.called_at is null
        and (s.session_date + s.end_time)
            + make_interval(mins => coalesce(v_settings.no_show_after_minutes, 30)) <= v_now
        -- Only recent sessions: never rewrite old history in bulk.
        and s.session_date >= v_today - 7
      returning a.id
    )
    select count(*) into v_no_shows from missed;
  end if;

  -- Waitlists of sessions that have started or were cancelled.
  with closed as (
    update public.session_waitlist w
    set status = 'expired', updated_at = now()
    from public.clinic_sessions s
    where s.id = w.session_id
      and w.status = 'waiting'
      and (s.status <> 'scheduled' or (s.session_date + s.start_time) <= v_now)
    returning w.id
  )
  select count(*) into v_expired from closed;

  return jsonb_build_object(
    'reminders_evening', v_evening,
    'reminders_morning', v_morning,
    'no_shows', v_no_shows,
    'waitlist_expired', v_expired
  );
end;
$$;

revoke execute on function public.run_visit_housekeeping() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'visit-housekeeping',
      '*/10 * * * *',
      'select public.run_visit_housekeeping()'
    );
  else
    raise notice 'pg_cron not enabled: reminders and automatic no-shows will not run. Enable pg_cron and re-run this migration.';
  end if;
end;
$$;


-- -------------------------------------------------------------------------
-- 4b. Account deletion leaves waitlists before freeing places
-- -------------------------------------------------------------------------
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

  -- 0. Leave waitlists first, so places freed below go to other people.
  update public.session_waitlist
  set status = 'left', updated_at = now()
  where account_holder_id = v_uid and status = 'waiting';

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

-- -------------------------------------------------------------------------
-- 5. Grants
-- -------------------------------------------------------------------------
do $$
declare
  f text;
begin
  foreach f in array array[
    'join_waitlist(uuid, uuid, text, text)',
    'leave_waitlist(uuid)'
  ]
  loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end;
$$;
