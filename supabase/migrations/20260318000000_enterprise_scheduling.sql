-- Enterprise scheduling domain (beneficiaries, holds, blackouts, settings)
-- Runs after 20260317000000_init.sql.

-- 1. Hospital-wide scheduling settings (admin-editable buffer between visits)
create table if not exists public.hospital_settings (
  id int primary key default 1 check (id = 1),
  buffer_minutes int not null default 15,
  updated_at timestamptz default now()
);

insert into public.hospital_settings (id, buffer_minutes)
values (1, 15)
on conflict (id) do nothing;

-- 2. Beneficiaries (account holder books for one or more people)
create table if not exists public.beneficiaries (
  id uuid primary key default gen_random_uuid(),
  account_holder_id uuid references public.profiles(id) on delete cascade not null,
  display_name text not null,
  relationship text not null check (
    relationship in ('self', 'child', 'parent', 'spouse', 'other')
  ),
  dob date not null,
  gender text not null,
  national_id text,
  hospital_file_id text,
  created_at timestamptz default now()
);

create index if not exists beneficiaries_account_holder_idx
  on public.beneficiaries (account_holder_id);

-- 3. Doctor metadata used by the scheduling UI
alter table public.doctors
  add column if not exists department text not null default 'Outpatients';

alter table public.doctors
  add column if not exists is_accepting_bookings boolean not null default true;

-- 4. Slot statuses include held + blackout (blocked kept for legacy rows)
alter table public.appointment_slots
  drop constraint if exists appointment_slots_status_check;

alter table public.appointment_slots
  add constraint appointment_slots_status_check
  check (status in ('available', 'held', 'booked', 'blocked', 'blackout'));

-- 5. Short-lived slot holds (5-minute TTL enforced in app + cleanup)
create table if not exists public.slot_holds (
  slot_id uuid primary key references public.appointment_slots(id) on delete cascade,
  held_by uuid references public.profiles(id) on delete cascade not null,
  expires_at timestamptz not null,
  created_at timestamptz default now()
);

create index if not exists slot_holds_expires_at_idx
  on public.slot_holds (expires_at);

-- 6. Doctor/admin blackout windows
create table if not exists public.blackout_rules (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid references public.doctors(id) on delete cascade not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text not null,
  set_by text not null check (set_by in ('doctor', 'admin')),
  created_at timestamptz default now()
);

create index if not exists blackout_rules_doctor_idx
  on public.blackout_rules (doctor_id, starts_at);

-- 7. Appointments — holder vs beneficiary + visit type
alter table public.appointments
  add column if not exists account_holder_id uuid references public.profiles(id);

alter table public.appointments
  add column if not exists beneficiary_id uuid references public.beneficiaries(id);

alter table public.appointments
  add column if not exists appointment_type text not null default 'in-clinic'
  check (appointment_type in ('in-clinic', 'telehealth', 'home-visit'));

alter table public.appointments
  add column if not exists room text;

alter table public.appointments
  add column if not exists video_url text;

alter table public.appointments
  add column if not exists address text;

update public.appointments
set account_holder_id = patient_id
where account_holder_id is null;

-- 8. RLS
alter table public.beneficiaries enable row level security;
alter table public.slot_holds enable row level security;
alter table public.blackout_rules enable row level security;
alter table public.hospital_settings enable row level security;

drop policy if exists "Account holders manage beneficiaries" on public.beneficiaries;
create policy "Account holders manage beneficiaries" on public.beneficiaries
  for all using (auth.uid() = account_holder_id)
  with check (auth.uid() = account_holder_id);

drop policy if exists "Admins view all beneficiaries" on public.beneficiaries;
create policy "Admins view all beneficiaries" on public.beneficiaries
  for select using (public.current_role() = 'admin');

drop policy if exists "Authenticated users manage own holds" on public.slot_holds;
create policy "Authenticated users manage own holds" on public.slot_holds
  for all using (auth.uid() = held_by)
  with check (auth.uid() = held_by);

drop policy if exists "Authenticated users view holds" on public.slot_holds;
create policy "Authenticated users view holds" on public.slot_holds
  for select using (auth.role() = 'authenticated');

drop policy if exists "Doctors view own blackouts" on public.blackout_rules;
create policy "Doctors view own blackouts" on public.blackout_rules
  for select using (auth.uid() = doctor_id);

drop policy if exists "Doctors create own blackouts" on public.blackout_rules;
create policy "Doctors create own blackouts" on public.blackout_rules
  for insert with check (
    auth.uid() = doctor_id and set_by = 'doctor'
  );

drop policy if exists "Admins manage blackouts" on public.blackout_rules;
create policy "Admins manage blackouts" on public.blackout_rules
  for all using (public.current_role() = 'admin');

drop policy if exists "Authenticated read settings" on public.hospital_settings;
create policy "Authenticated read settings" on public.hospital_settings
  for select using (auth.role() = 'authenticated');

drop policy if exists "Admins update settings" on public.hospital_settings;
create policy "Admins update settings" on public.hospital_settings
  for update using (public.current_role() = 'admin');

-- Extend appointment select for account holders (proxy-managed visits)
drop policy if exists "Patients view own appointments" on public.appointments;
create policy "Patients view own appointments" on public.appointments
  for select using (
    auth.uid() = patient_id or auth.uid() = account_holder_id
  );

drop policy if exists "Patients cancel own appointments" on public.appointments;
create policy "Patients cancel own appointments" on public.appointments
  for update using (
    auth.uid() = patient_id or auth.uid() = account_holder_id
  );

drop policy if exists "Patients create own appointments" on public.appointments;
create policy "Patients create own appointments" on public.appointments
  for insert with check (
    auth.uid() = patient_id
    and auth.uid() = account_holder_id
    and exists (
      select 1 from public.beneficiaries b
      where b.id = beneficiary_id and b.account_holder_id = auth.uid()
    )
  );

-- Patients need to move slots through held → booked during online booking
drop policy if exists "Authenticated users update slots for booking" on public.appointment_slots;
create policy "Authenticated users update slots for booking"
  on public.appointment_slots for update
  using (auth.role() = 'authenticated');
