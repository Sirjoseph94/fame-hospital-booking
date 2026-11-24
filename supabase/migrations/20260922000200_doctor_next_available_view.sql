-- =========================================================================
-- Next open slot per doctor
-- Runs after 20260922000100_beneficiary_integrity.sql.
--
-- listDoctors() used to download every future open slot for every doctor
-- just to find each doctor's earliest one. This view returns one row per
-- doctor. security_invoker = true: the caller's RLS applies (including the
-- "Active accounts only" policy), exactly as if they queried the table.
--
-- Idempotent: safe to re-run.
-- =========================================================================

create or replace view public.doctor_next_available_slots
with (security_invoker = true) as
select distinct on (s.doctor_id)
  s.doctor_id,
  s.slot_date,
  s.start_time,
  s.end_time
from public.appointment_slots s
where s.status = 'available'
  and s.slot_date >= current_date
order by s.doctor_id, s.slot_date, s.start_time;

revoke all on public.doctor_next_available_slots from public, anon;
grant select on public.doctor_next_available_slots to authenticated;

-- Speeds up the view and the per-doctor slot listings.
create index if not exists appointment_slots_status_date_idx
  on public.appointment_slots (status, slot_date, doctor_id, start_time);
