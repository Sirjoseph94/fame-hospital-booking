-- Doctors can read patient/beneficiary context for appointments on their schedule.

create policy "Doctors view appointment holder profiles" on public.profiles
  for select using (
    exists (
      select 1 from public.appointments a
      where a.doctor_id = auth.uid()
        and (
          a.account_holder_id = profiles.id
          or a.patient_id = profiles.id
        )
    )
  );

create policy "Doctors view appointment beneficiaries" on public.beneficiaries
  for select using (
    exists (
      select 1 from public.appointments a
      where a.doctor_id = auth.uid()
        and a.beneficiary_id = beneficiaries.id
    )
  );
