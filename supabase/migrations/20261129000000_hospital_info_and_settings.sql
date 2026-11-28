-- =========================================================================
-- Hospital information and platform settings (admin-managed)
-- Runs after 20261128000600_remove_legacy_slots.sql.
--
--   * hospital_info: one row with the public contact details shown on the
--     About screen, the legal pages and the account deletion page. Readable
--     by everyone (including signed-out visitors); only admins can change it.
--     Phone and email start empty: the app hides what isn't set, and the
--     admin Settings screen asks for them. No placeholder contacts.
--   * hospital_settings gains the platform settings the admin Settings screen
--     edits: booking window, check-in window, reminders, automatic no-shows
--     and the waitlist. (The features using them arrive in the next
--     migrations; defaults keep today's behaviour until then.)
--   * check_in_secret: the code behind the clinic's check-in QR poster. Only
--     admins can read it; rotate_check_in_code() issues a new one.
--   * Every change to hospital_info / hospital_settings is written to the
--     admin audit log.
--
-- Idempotent: safe to re-run.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. hospital_info
-- -------------------------------------------------------------------------
create table if not exists public.hospital_info (
  id int primary key default 1 check (id = 1),
  name text not null default 'FAME Hospital',
  about text not null default
    'Book a place in a doctor''s clinic session. Patients are seen in order of arrival.',
  phone text not null default '',
  emergency_phone text not null default '',
  email text not null default '',
  address text not null default '',
  opening_hours text not null default 'Mon–Sat · 7:00 AM – 9:00 PM',
  website text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  constraint hospital_info_name_length check (char_length(trim(name)) between 1 and 120),
  constraint hospital_info_about_length check (char_length(about) <= 1000),
  constraint hospital_info_phone_format check (
    char_length(phone) <= 40 and phone ~ '^[0-9+()\-. ]*$'
  ),
  constraint hospital_info_emergency_phone_format check (
    char_length(emergency_phone) <= 40 and emergency_phone ~ '^[0-9+()\-. ]*$'
  ),
  constraint hospital_info_email_format check (
    email = '' or (char_length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')
  ),
  constraint hospital_info_address_length check (char_length(address) <= 300),
  constraint hospital_info_hours_length check (char_length(opening_hours) <= 200),
  constraint hospital_info_website_format check (
    website = '' or (char_length(website) <= 200 and website ~* '^https://[^\s]+$')
  )
);

insert into public.hospital_info (id) values (1) on conflict (id) do nothing;

alter table public.hospital_info enable row level security;

drop policy if exists "Anyone reads hospital info" on public.hospital_info;
create policy "Anyone reads hospital info" on public.hospital_info
  for select to anon, authenticated
  using (true);

drop policy if exists "Admins update hospital info" on public.hospital_info;
create policy "Admins update hospital info" on public.hospital_info
  for update to authenticated
  using (public.current_role() = 'admin')
  with check (public.current_role() = 'admin');

-- Deactivated accounts may still read the contact details (to get in touch),
-- but never write.
drop policy if exists "Active accounts only" on public.hospital_info;
create policy "Active accounts only" on public.hospital_info
  as restrictive for update to authenticated
  using ((select public.is_active_user()))
  with check ((select public.is_active_user()));

revoke all on public.hospital_info from anon, authenticated;
-- Public columns only (updated_by is an admin's user id).
grant select (id, name, about, phone, emergency_phone, email, address, opening_hours, website, updated_at)
  on public.hospital_info to anon, authenticated;
grant update (name, about, phone, emergency_phone, email, address, opening_hours, website)
  on public.hospital_info to authenticated;

-- Trim text and stamp who changed it.
create or replace function public.stamp_hospital_info()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.name := trim(new.name);
  new.about := trim(new.about);
  new.phone := trim(new.phone);
  new.emergency_phone := trim(new.emergency_phone);
  new.email := lower(trim(new.email));
  new.address := trim(new.address);
  new.opening_hours := trim(new.opening_hours);
  new.website := trim(new.website);
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;

drop trigger if exists hospital_info_stamp on public.hospital_info;
create trigger hospital_info_stamp
  before update on public.hospital_info
  for each row execute function public.stamp_hospital_info();

-- -------------------------------------------------------------------------
-- 2. Platform settings
-- -------------------------------------------------------------------------
alter table public.hospital_settings
  add column if not exists booking_window_days int not null default 60
    check (booking_window_days between 1 and 365);
alter table public.hospital_settings
  add column if not exists check_in_opens_minutes int not null default 120
    check (check_in_opens_minutes between 0 and 720);
alter table public.hospital_settings
  add column if not exists reminders_enabled boolean not null default true;
alter table public.hospital_settings
  add column if not exists reminder_evening_hour int not null default 18
    check (reminder_evening_hour between 12 and 21);
alter table public.hospital_settings
  add column if not exists reminder_morning_hour int not null default 7
    check (reminder_morning_hour between 5 and 11);
alter table public.hospital_settings
  add column if not exists auto_no_show boolean not null default true;
alter table public.hospital_settings
  add column if not exists no_show_after_minutes int not null default 30
    check (no_show_after_minutes between 0 and 720);
alter table public.hospital_settings
  add column if not exists waitlist_enabled boolean not null default true;

-- The settings row is only ever updated (never inserted/deleted by clients).
revoke insert, delete on public.hospital_settings from anon, authenticated;
revoke all on public.hospital_settings from anon;

create or replace function public.stamp_hospital_settings()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists hospital_settings_stamp on public.hospital_settings;
create trigger hospital_settings_stamp
  before update on public.hospital_settings
  for each row execute function public.stamp_hospital_settings();

-- -------------------------------------------------------------------------
-- 3. Audit changes (the names of the fields that changed)
-- -------------------------------------------------------------------------
create or replace function public.audit_hospital_config_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old jsonb := to_jsonb(old) - 'updated_at' - 'updated_by';
  v_new jsonb := to_jsonb(new) - 'updated_at' - 'updated_by';
  v_changed text[];
begin
  select coalesce(array_agg(k order by k), '{}') into v_changed
  from jsonb_object_keys(v_new) k
  where v_new -> k is distinct from v_old -> k;

  if cardinality(v_changed) = 0 then
    return new;
  end if;

  perform public.log_admin_audit(
    case when tg_table_name = 'hospital_info'
      then 'hospital_info_updated' else 'hospital_settings_updated' end,
    tg_table_name,
    null,
    jsonb_build_object('fields', to_jsonb(v_changed))
  );
  return new;
end;
$$;

revoke execute on function public.audit_hospital_config_change() from public, anon, authenticated;

drop trigger if exists hospital_info_audit on public.hospital_info;
create trigger hospital_info_audit
  after update on public.hospital_info
  for each row execute function public.audit_hospital_config_change();

drop trigger if exists hospital_settings_audit on public.hospital_settings;
create trigger hospital_settings_audit
  after update on public.hospital_settings
  for each row execute function public.audit_hospital_config_change();

-- -------------------------------------------------------------------------
-- 4. Check-in code (behind the QR poster at reception)
-- -------------------------------------------------------------------------
create table if not exists public.check_in_secret (
  id int primary key default 1 check (id = 1),
  code text not null,
  rotated_at timestamptz not null default now(),
  constraint check_in_secret_code_format check (code ~ '^[A-Z2-9]{6}$')
);

-- 6 characters from an alphabet without look-alikes (no 0/O or 1/I).
-- 32 symbols divide 256 evenly, so each byte maps without bias.
create or replace function public.new_check_in_code()
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  -- Bytes 0-5 of a v4 UUID are fully random (the version bits are in byte 6).
  v_bytes bytea := uuid_send(gen_random_uuid());
  v_code text := '';
  i int;
begin
  for i in 0..5 loop
    v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, i) % 32) + 1, 1);
  end loop;
  return v_code;
end;
$$;

revoke execute on function public.new_check_in_code() from public, anon, authenticated;

insert into public.check_in_secret (id, code)
values (1, public.new_check_in_code())
on conflict (id) do nothing;

alter table public.check_in_secret enable row level security;

drop policy if exists "Admins read check-in code" on public.check_in_secret;
create policy "Admins read check-in code" on public.check_in_secret
  for select to authenticated
  using (public.current_role() = 'admin');

drop policy if exists "Active accounts only" on public.check_in_secret;
create policy "Active accounts only" on public.check_in_secret
  as restrictive for all to authenticated
  using ((select public.is_active_user()))
  with check ((select public.is_active_user()));

revoke all on public.check_in_secret from anon, authenticated;
grant select on public.check_in_secret to authenticated;

create or replace function public.rotate_check_in_code()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
begin
  if auth.uid() is null then
    return jsonb_build_object('success', false, 'code', 'NOT_AUTHENTICATED');
  end if;
  perform public.assert_active_caller();
  if public.current_role() is distinct from 'admin' then
    return jsonb_build_object('success', false, 'code', 'FORBIDDEN');
  end if;

  v_code := public.new_check_in_code();
  update public.check_in_secret set code = v_code, rotated_at = now() where id = 1;
  perform public.log_admin_audit('check_in_code_rotated', 'check_in_secret', null, '{}'::jsonb);

  return jsonb_build_object('success', true, 'check_in_code', v_code);
end;
$$;

revoke execute on function public.rotate_check_in_code() from public, anon;
grant execute on function public.rotate_check_in_code() to authenticated;
