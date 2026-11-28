-- =========================================================================
-- Admins can see and retry failed notifications
-- Runs after 20261128000400_validate_time_zone.sql.
--
-- Failed email/SMS/push deliveries were recorded but only the recipient could
-- read them, so nobody at the hospital could tell a message hadn't arrived.
--
--   * Admins may read all delivery rows.
--   * retry_notification_delivery resets a failed row to pending with a fresh
--     attempt count; the dispatcher's retry sweep (RUNBOOK §12) resends it.
--
-- Idempotent: safe to re-run.
-- =========================================================================

drop policy if exists "Admins read notification deliveries" on public.notification_deliveries;
create policy "Admins read notification deliveries"
  on public.notification_deliveries
  for select
  using (public.current_role() = 'admin');

create index if not exists notification_deliveries_failed_idx
  on public.notification_deliveries (created_at desc)
  where status = 'failed';

create or replace function public.retry_notification_delivery(p_delivery_id uuid)
returns jsonb
language plpgsql
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

  update public.notification_deliveries
  set status = 'pending',
      attempts = 0,
      error = null,
      claimed_at = null,
      processed_at = null
  where id = p_delivery_id and status = 'failed';

  if not found then
    return jsonb_build_object('success', false, 'code', 'NOT_MODIFIABLE');
  end if;
  return jsonb_build_object('success', true);
end;
$$;

revoke execute on function public.retry_notification_delivery(uuid) from public, anon;
grant execute on function public.retry_notification_delivery(uuid) to authenticated;
