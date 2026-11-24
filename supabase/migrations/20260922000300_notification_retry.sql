-- =========================================================================
-- Notification outbox: retries and stuck-row recovery
-- Runs after 20260922000200_doctor_next_available_view.sql.
--
-- claimed_at records when the Edge Function claimed a row (pending →
-- processing). Its sweep mode resets rows stuck in `processing` (function
-- crashed mid-send) and re-sends `pending` rows below the attempt limit.
--
-- Idempotent: safe to re-run.
-- =========================================================================

alter table public.notification_deliveries
  add column if not exists claimed_at timestamptz;

create index if not exists notification_deliveries_processing_idx
  on public.notification_deliveries (claimed_at)
  where status = 'processing';
