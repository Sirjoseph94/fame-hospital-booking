-- =========================================================================
-- One "self" beneficiary per account holder
-- Runs after 20260922000000_enforce_account_deactivation.sql.
--
-- The app checked this client-side only, and sign-up plus the Home screen's
-- ensureSelfBeneficiary could both insert a "self" row at the same time.
--
-- Idempotent: safe to re-run.
-- =========================================================================

do $$
declare
  v_dupes int;
begin
  select count(*) into v_dupes
  from (
    select account_holder_id
    from public.beneficiaries
    where relationship = 'self'
    group by account_holder_id
    having count(*) > 1
  ) d;

  if v_dupes > 0 then
    raise exception
      'beneficiary_integrity: % account(s) have more than one "self" beneficiary. Merge them first (repoint appointments.beneficiary_id to the row you keep, then delete the others). Query: select account_holder_id, array_agg(id order by created_at) from public.beneficiaries where relationship = ''self'' group by account_holder_id having count(*) > 1;',
      v_dupes;
  end if;
end;
$$;

create unique index if not exists beneficiaries_one_self_per_holder
  on public.beneficiaries (account_holder_id)
  where relationship = 'self';
