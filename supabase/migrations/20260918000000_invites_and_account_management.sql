-- =========================================================
-- Migration: Doctor Invites & Account Management
-- =========================================================

-- 1. Add is_active column to public.profiles if not exists
alter table public.profiles
  add column if not exists is_active boolean default true not null;

-- 2. Create doctor_invites table
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

-- 3. Enable RLS on doctor_invites
alter table public.doctor_invites enable row level security;

-- Admin can do everything on doctor_invites
drop policy if exists "Admins manage all doctor_invites" on public.doctor_invites;
create policy "Admins manage all doctor_invites" on public.doctor_invites
  for all using (public.current_role() = 'admin');

-- Authenticated users or signups can verify an invite by code
drop policy if exists "Anyone authenticated can check invite code" on public.doctor_invites;
create policy "Anyone authenticated can check invite code" on public.doctor_invites
  for select using (auth.role() = 'authenticated');

-- 4. RPC Function to claim an invite code securely
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

  -- Lookup invite
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

  -- Upgrade profile to doctor
  update public.profiles
  set role = 'doctor'
  where id = v_uid;

  -- Insert or update doctor record
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

  -- Mark invite as accepted
  update public.doctor_invites
  set status = 'accepted',
      accepted_by = v_uid
  where id = v_invite.id;

  return json_build_object('success', true, 'message', 'Doctor profile activated successfully.');
end;
$$ language plpgsql security definer;
