-- =========================================================================
-- Admin reports: attendance, no-shows and waiting times
-- Runs after 20261129000200_reminders_and_waitlist.sql.
--
-- visit_report(from, to) summarises clinic-session bookings by visit date
-- (inclusive, at most 366 days): totals (from which the app shows the no-show
-- rate: no-shows out of seen + no-show), average wait from check-in to being
-- called, average time with the doctor, and the same per doctor and per day.
-- Admins only.
--
-- Idempotent: safe to re-run.
-- =========================================================================

create index if not exists appointments_date_status_idx
  on public.appointments (appointment_date, status)
  where session_id is not null;

create or replace function public.visit_report(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return jsonb_build_object('success', false, 'code', 'NOT_AUTHENTICATED');
  end if;
  perform public.assert_active_caller();
  if public.current_role() is distinct from 'admin' then
    return jsonb_build_object('success', false, 'code', 'FORBIDDEN');
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 365 then
    return jsonb_build_object('success', false, 'code', 'INVALID_INPUT');
  end if;

  return (
    with report_rows as (
      select
        a.doctor_id,
        a.appointment_date as visit_date,
        a.status,
        case when a.called_at is not null and a.checked_in_at is not null
          then extract(epoch from (a.called_at - a.checked_in_at)) / 60 end as wait_minutes,
        case when a.status = 'completed' and a.called_at is not null and a.finished_at is not null
          then extract(epoch from (a.finished_at - a.called_at)) / 60 end as visit_minutes
      from public.appointments a
      where a.session_id is not null
        and a.appointment_date between p_from and p_to
    ),
    totals as (
      select jsonb_build_object(
        'booked', count(*) filter (where status <> 'cancelled'),
        'seen', count(*) filter (where status = 'completed'),
        'no_show', count(*) filter (where status = 'no_show'),
        'cancelled', count(*) filter (where status = 'cancelled'),
        'upcoming', count(*) filter (where status in ('pending', 'confirmed')),
        'avg_wait_minutes', round(avg(wait_minutes), 1),
        'avg_visit_minutes', round(avg(visit_minutes), 1)
      ) as j
      from report_rows
    ),
    per_doctor as (
      select jsonb_build_object(
        'doctor_id', r.doctor_id,
        'name', coalesce(p.full_name, 'Doctor'),
        'booked', count(*) filter (where r.status <> 'cancelled'),
        'seen', count(*) filter (where r.status = 'completed'),
        'no_show', count(*) filter (where r.status = 'no_show'),
        'cancelled', count(*) filter (where r.status = 'cancelled'),
        'avg_wait_minutes', round(avg(r.wait_minutes), 1)
      ) as j
      from report_rows r
      left join public.profiles p on p.id = r.doctor_id
      group by r.doctor_id, p.full_name
    ),
    per_day as (
      select jsonb_build_object(
        'date', r.visit_date,
        'booked', count(*) filter (where r.status <> 'cancelled'),
        'seen', count(*) filter (where r.status = 'completed'),
        'no_show', count(*) filter (where r.status = 'no_show')
      ) as j
      from report_rows r
      group by r.visit_date
    )
    select jsonb_build_object(
      'success', true,
      'from', p_from,
      'to', p_to,
      'totals', (select j from totals),
      'doctors', coalesce((select jsonb_agg(j order by j->>'name') from per_doctor), '[]'::jsonb),
      'days', coalesce((select jsonb_agg(j order by j->>'date') from per_day), '[]'::jsonb)
    )
  );
end;
$$;

revoke execute on function public.visit_report(date, date) from public, anon;
grant execute on function public.visit_report(date, date) to authenticated;
