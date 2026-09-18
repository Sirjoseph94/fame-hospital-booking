-- Notification preferences, push tokens, delivery outbox, appointment triggers.

-- 1. Preferences (opt-in defaults false)
create table if not exists public.notification_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  email_opt_in boolean not null default false,
  sms_opt_in boolean not null default false,
  push_opt_in boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.notification_preferences enable row level security;

create policy "Users manage own notification preferences"
  on public.notification_preferences
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 2. Expo push device tokens
create table if not exists public.push_device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  expo_push_token text not null,
  platform text not null check (platform in ('ios', 'android')),
  device_label text,
  last_seen_at timestamptz not null default now(),
  unique (expo_push_token)
);

create index if not exists push_device_tokens_user_idx
  on public.push_device_tokens (user_id);

alter table public.push_device_tokens enable row level security;

create policy "Users manage own push tokens"
  on public.push_device_tokens
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 3. Delivery outbox (inserts via trigger only)
create table if not exists public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  appointment_id uuid references public.appointments(id) on delete set null,
  event_type text not null,
  channel text not null check (channel in ('email', 'sms', 'push')),
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'skipped', 'failed')),
  error text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists notification_deliveries_pending_idx
  on public.notification_deliveries (status, created_at)
  where status = 'pending';

alter table public.notification_deliveries enable row level security;

create policy "Recipients view own notification deliveries"
  on public.notification_deliveries
  for select
  using (auth.uid() = recipient_id);

-- 4. Enqueue helper (security definer)
create or replace function public.enqueue_notification_deliveries(
  p_appointment_id uuid,
  p_recipient_id uuid,
  p_event_type text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_recipient_id is null then
    return;
  end if;

  insert into public.notification_deliveries (recipient_id, appointment_id, event_type, channel)
  values
    (p_recipient_id, p_appointment_id, p_event_type, 'email'),
    (p_recipient_id, p_appointment_id, p_event_type, 'sms'),
    (p_recipient_id, p_appointment_id, p_event_type, 'push');
end;
$$;

create or replace function public.appointment_patient_recipient(p_row public.appointments)
returns uuid
language sql
immutable
as $$
  select coalesce(p_row.account_holder_id, p_row.patient_id);
$$;

create or replace function public.enqueue_appointment_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_patient uuid;
  v_rescheduled boolean;
begin
  if tg_op = 'INSERT' then
    if new.status = 'pending' then
      perform public.enqueue_notification_deliveries(
        new.id, new.doctor_id, 'booking_pending_doctor'
      );
      v_patient := public.appointment_patient_recipient(new);
      perform public.enqueue_notification_deliveries(
        new.id, v_patient, 'booking_pending_patient'
      );
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    v_patient := public.appointment_patient_recipient(new);

    if old.status is distinct from new.status then
      if new.status = 'confirmed' then
        perform public.enqueue_notification_deliveries(
          new.id, v_patient, 'visit_confirmed'
        );
      elsif new.status = 'cancelled' then
        perform public.enqueue_notification_deliveries(
          new.id, v_patient, 'visit_cancelled'
        );
        perform public.enqueue_notification_deliveries(
          new.id, new.doctor_id, 'visit_cancelled'
        );
      elsif new.status = 'completed' then
        perform public.enqueue_notification_deliveries(
          new.id, v_patient, 'visit_completed'
        );
      end if;
    end if;

    if new.status <> 'cancelled' then
      v_rescheduled :=
        old.appointment_date is distinct from new.appointment_date
        or old.start_time is distinct from new.start_time
        or old.slot_id is distinct from new.slot_id;

      if v_rescheduled
        and not (
          old.status is distinct from new.status
          and new.status in ('cancelled', 'completed')
        )
      then
        perform public.enqueue_notification_deliveries(
          new.id, v_patient, 'visit_rescheduled'
        );
        perform public.enqueue_notification_deliveries(
          new.id, new.doctor_id, 'visit_rescheduled_doctor'
        );
      end if;
    end if;

    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists appointments_enqueue_notifications on public.appointments;
create trigger appointments_enqueue_notifications
  after insert or update on public.appointments
  for each row
  execute function public.enqueue_appointment_notifications();

revoke all on public.notification_deliveries from authenticated;
grant select on public.notification_deliveries to authenticated;
grant all on public.notification_preferences to authenticated;
grant all on public.push_device_tokens to authenticated;
