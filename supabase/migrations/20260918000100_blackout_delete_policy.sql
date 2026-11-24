-- Allow doctors to remove their own future blackout rules (Phase 5, I-36).
drop policy if exists "Doctors delete own blackouts" on public.blackout_rules;
create policy "Doctors delete own blackouts"
  on public.blackout_rules
  for delete
  using (auth.uid() = doctor_id);
