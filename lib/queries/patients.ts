import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query/keys";
import { accountsService } from "@/lib/services/accounts";
import { patientsService } from "@/lib/services/patients";

/** Admin: patient search (name, phone, hospital file number). */
export function usePatientSearch(term: string) {
  return useQuery({
    queryKey: queryKeys.patients.search(term.trim().toLowerCase()),
    queryFn: () => patientsService.search(term),
    placeholderData: keepPreviousData,
  });
}

/** Admin: one patient's record. */
export function usePatientRecord(patientId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.patients.detail(patientId ?? ""),
    queryFn: () => patientsService.get(patientId!),
    enabled: Boolean(patientId),
  });
}

/** Admin: deactivate / reactivate a patient account. */
export function useSetPatientActive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { patientId: string; isActive: boolean }) =>
      accountsService.setProfileActive(input.patientId, input.isActive),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.patients.all }),
  });
}
