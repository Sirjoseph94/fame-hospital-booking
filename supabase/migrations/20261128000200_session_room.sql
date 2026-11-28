-- =========================================================================
-- Session room, and editing a session's room / patient limit
-- Runs after 20261128000100_doctor_department.sql.
--
-- Rooms used to be set when a doctor confirmed a visit; sessions removed that
-- step, so nothing set a room any more. A room now belongs to the session and
-- every booking in it shows that room.
--
-- Idempotent: safe to re-run.
-- =========================================================================

alter table public.clinic_sessions
  add column if not exists room text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'clinic_sessions_room_length'
  ) then
    alter table public.clinic_sessions
      add constraint clinic_sessions_room_length check (char_length(room) <= 40);
  end if;
end;
$$;

-- Recreate the availability view with the room (and the view built on it).
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
    and coalesce(b.booked, 0) < s.capacity
  ) as is_bookable,
  s.room
from public.clinic_sessions s
left join lateral (
  select count(*) as booked
  from public.appointments a
  where a.session_id = s.id and a.status <> 'cancelled'
) b on true
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

-- create_clinic_sessions gains p_room. Drop the old signature first: two
-- overloads would make named-argument calls ambiguous.
drop function if exists public.create_clinic_sessions(uuid, date, int, int[], time, time, int);

create or replace function public.create_clinic_sessions(
  p_doctor_id uuid,
  p_first_date date,
  p_weeks int,
  p_weekdays int[],
  p_start_time time,
  p_end_time time,
  p_capacity int,
  p_room text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_now timestamp := public.hospital_now();
  v_room text := nullif(trim(coalesce(p_room, '')), '');
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
     or p_first_date < v_now::date
     or char_length(coalesce(v_room, '')) > 40 then
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
      doctor_id, session_date, start_time, end_time, capacity, room, created_by
    )
    values (p_doctor_id, v_date, p_start_time, p_end_time, p_capacity, v_room, v_uid);
    v_created := v_created + 1;
  end loop;

  return jsonb_build_object('success', true, 'created', v_created, 'skipped', v_skipped);
end;
$$;

-- Change an upcoming session's room and patient limit. The limit can't drop
-- below the places already booked.
create or replace function public.update_clinic_session(
  p_session_id uuid,
  p_room text,
  p_capacity int
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_session public.clinic_sessions%rowtype;
  v_room text := nullif(trim(coalesce(p_room, '')), '');
  v_booked int;
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
  if p_capacity is null or p_capacity not between 1 and 200
     or char_length(coalesce(v_room, '')) > 40 then
    return jsonb_build_object('success', false, 'code', 'INVALID_INPUT');
  end if;

  select count(*) into v_booked
  from public.appointments a
  where a.session_id = p_session_id and a.status <> 'cancelled';
  if p_capacity < v_booked then
    return jsonb_build_object('success', false, 'code', 'CAPACITY_BELOW_BOOKED', 'booked', v_booked);
  end if;

  update public.clinic_sessions
  set room = v_room, capacity = p_capacity
  where id = p_session_id;

  return jsonb_build_object('success', true);
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'create_clinic_sessions(uuid, date, int, int[], time, time, int, text)',
    'update_clinic_session(uuid, text, int)'
  ]
  loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end;
$$;
