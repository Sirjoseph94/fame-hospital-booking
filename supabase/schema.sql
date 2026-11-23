-- =========================================================
-- Hospital Booking App — Supabase Schema
-- Run this in the Supabase SQL editor (Project > SQL Editor)
-- =========================================================

-- 1. PROFILES
-- Extends Supabase's built-in auth.users with app-specific fields.
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  full_name text not null,
  role text not null check (role in ('patient', 'doctor', 'admin')) default 'patient',
  phone text,
  avatar_url text,
  is_active boolean default true not null,
  created_at timestamptz default now()
);

-- Automatically create a profile row whenever a new auth user signs up.
-- Role is ALWAYS 'patient': user metadata is client-controlled and must never
-- decide privileges. Doctors are promoted via claim_doctor_invite; admins
-- manually (see docs/RUNBOOK.md §3).
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', 'New User'),
    'patient'
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 2. DOCTORS
-- One row per doctor, linked 1:1 to a profile with role = 'doctor'.
create table if not exists public.doctors (
  id uuid references public.profiles(id) on delete cascade primary key,
  specialty text not null,
  bio text,
  consultation_fee numeric(10, 2) default 0,
  years_experience int default 0,
  is_active boolean default true
);

-- 3. APPOINTMENT SLOTS
-- Discrete bookable time slots a doctor has opened up.
create table if not exists public.appointment_slots (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid references public.doctors(id) on delete cascade not null,
  slot_date date not null,
  start_time time not null,
  end_time time not null,
  status text not null check (status in ('available', 'booked', 'blocked')) default 'available',
  created_at timestamptz default now(),
  unique (doctor_id, slot_date, start_time)
);

-- 4. APPOINTMENTS
create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references public.profiles(id) on delete cascade not null,
  doctor_id uuid references public.doctors(id) on delete cascade not null,
  slot_id uuid references public.appointment_slots(id) on delete set null,
  appointment_date date not null,
  start_time time not null,
  status text not null check (status in ('pending', 'confirmed', 'cancelled', 'completed')) default 'pending',
  reason text,
  notes text,
  created_at timestamptz default now()
);

-- =========================================================
-- ROW LEVEL SECURITY
-- =========================================================
alter table public.profiles enable row level security;
alter table public.doctors enable row level security;
alter table public.appointment_slots enable row level security;
alter table public.appointments enable row level security;

-- Helper: check the caller's role without recursive RLS lookups.
create or replace function public.current_role()
returns text as $$
  select role from public.profiles where id = auth.uid();
$$ language sql stable security definer;

-- PROFILES policies
create policy "Users can view own profile" on public.profiles
  for select using (auth.uid() = id);
create policy "Admins can view all profiles" on public.profiles
  for select using (public.current_role() = 'admin');
create policy "Users can update own profile" on public.profiles
  for update using (auth.uid() = id);
create policy "Admins can update any profile" on public.profiles
  for update using (public.current_role() = 'admin');

-- DOCTORS policies (public read for anyone logged in — needed to browse doctors)
create policy "Anyone authenticated can view doctors" on public.doctors
  for select using (auth.role() = 'authenticated');
create policy "Doctors can update own record" on public.doctors
  for update using (auth.uid() = id);
create policy "Admins can manage doctors" on public.doctors
  for all using (public.current_role() = 'admin');

-- APPOINTMENT SLOTS policies
create policy "Anyone authenticated can view slots" on public.appointment_slots
  for select using (auth.role() = 'authenticated');
create policy "Doctors manage own slots" on public.appointment_slots
  for all using (auth.uid() = doctor_id);
create policy "Admins manage all slots" on public.appointment_slots
  for all using (public.current_role() = 'admin');

-- APPOINTMENTS policies
create policy "Patients view own appointments" on public.appointments
  for select using (auth.uid() = patient_id);
create policy "Patients create own appointments" on public.appointments
  for insert with check (auth.uid() = patient_id);
create policy "Patients cancel own appointments" on public.appointments
  for update using (auth.uid() = patient_id);
create policy "Doctors view own appointments" on public.appointments
  for select using (auth.uid() = doctor_id);
create policy "Doctors update own appointments" on public.appointments
  for update using (auth.uid() = doctor_id);
create policy "Admins manage all appointments" on public.appointments
  for all using (public.current_role() = 'admin');

-- 5. DOCTOR INVITES
create table if not exists public.doctor_invites (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  email text not null,
  specialty text not null,
  bio text,
  consultation_fee numeric(10, 2) default 0,
  years_experience int default 0,
  status text not null check (status in ('pending', 'accepted', 'revoked', 'expired')) default 'pending',
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_by uuid references public.profiles(id) on delete set null,
  accepted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now()
);

alter table public.doctor_invites enable row level security;

create policy "Admins manage all doctor_invites" on public.doctor_invites
  for all using (public.current_role() = 'admin');

create policy "Anyone authenticated can check invite code" on public.doctor_invites
  for select using (auth.role() = 'authenticated');

create or replace function public.claim_doctor_invite(p_code text)
returns json as $$
declare
  v_invite record;
  v_uid uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    return json_build_object('success', false, 'message', 'Not authenticated');
  end if;

  select * into v_invite from public.doctor_invites
  where upper(trim(code)) = upper(trim(p_code))
  limit 1;

  if v_invite.id is null then
    return json_build_object('success', false, 'message', 'Invalid invite code.');
  end if;

  if v_invite.status <> 'pending' then
    return json_build_object('success', false, 'message', 'Invite code has already been ' || v_invite.status || '.');
  end if;

  if v_invite.expires_at < now() then
    update public.doctor_invites set status = 'expired' where id = v_invite.id;
    return json_build_object('success', false, 'message', 'This invite code has expired.');
  end if;

  update public.profiles
  set role = 'doctor'
  where id = v_uid;

  insert into public.doctors (id, specialty, bio, consultation_fee, years_experience, is_active)
  values (
    v_uid,
    v_invite.specialty,
    v_invite.bio,
    coalesce(v_invite.consultation_fee, 0),
    coalesce(v_invite.years_experience, 0),
    true
  )
  on conflict (id) do update
  set specialty = excluded.specialty,
      bio = excluded.bio,
      consultation_fee = excluded.consultation_fee,
      years_experience = excluded.years_experience,
      is_active = true;

  update public.doctor_invites
  set status = 'accepted',
      accepted_by = v_uid
  where id = v_invite.id;

  return json_build_object('success', true, 'message', 'Doctor profile activated successfully.');
end;
$$ language plpgsql security definer;
