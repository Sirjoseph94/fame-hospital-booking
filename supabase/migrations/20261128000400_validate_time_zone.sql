-- =========================================================================
-- Validate hospital_settings.time_zone
-- Runs after 20261128000300_remove_family_members.sql.
--
-- hospital_now() (used by every session check) fails if time_zone is not a
-- real IANA zone, which would break booking for everyone. Admins can now
-- change the zone in the app, so reject unknown names at write time.
--
-- Idempotent: safe to re-run.
-- =========================================================================

create or replace function public.guard_hospital_time_zone()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.time_zone is distinct from old.time_zone
     and not exists (select 1 from pg_timezone_names where name = new.time_zone) then
    raise exception 'Unknown time zone: %', new.time_zone using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists hospital_settings_guard_time_zone on public.hospital_settings;
create trigger hospital_settings_guard_time_zone
  before update on public.hospital_settings
  for each row execute function public.guard_hospital_time_zone();
