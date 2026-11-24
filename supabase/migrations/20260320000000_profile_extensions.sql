-- Optional contact + medical fields on patient profiles (all nullable).

alter table public.profiles
  add column if not exists emergency_contact_name text;

alter table public.profiles
  add column if not exists emergency_contact_phone text;

alter table public.profiles
  add column if not exists address text;

alter table public.profiles
  add column if not exists blood_type text;

alter table public.profiles
  add column if not exists allergies text;

alter table public.profiles
  add column if not exists medications text;

alter table public.profiles
  add column if not exists medical_conditions text;

alter table public.profiles
  add column if not exists medical_notes text;
