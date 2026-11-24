import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query/keys";
import { accountsService } from "@/lib/services/accounts";
import { schedulingService } from "@/lib/services/scheduling";

/** Active doctors with their next open slot (patient booking, name lookups). */
export function useDoctors() {
  return useQuery({
    queryKey: queryKeys.doctors.list,
    queryFn: () => schedulingService.listDoctors(),
  });
}

/** Admin roster: every doctor, including inactive accounts. */
export function useDoctorRoster(enabled = true) {
  return useQuery({
    queryKey: queryKeys.doctors.roster,
    queryFn: () => schedulingService.listDoctorsForAdmin(),
    enabled,
  });
}

/** One doctor's stored settings (includes inactive doctors). */
export function useDoctor(doctorId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.doctors.detail(doctorId ?? ""),
    queryFn: () => schedulingService.getDoctor(doctorId!),
    enabled: Boolean(doctorId),
  });
}

export function useSetDoctorAcceptingBookings(doctorId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (isAccepting: boolean) =>
      schedulingService.setDoctorAcceptingBookings(doctorId, isAccepting),
    onSuccess: (detail) => {
      queryClient.setQueryData(queryKeys.doctors.detail(doctorId), detail);
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.doctors.all }),
  });
}

/** Admin: activate / deactivate a user's account. */
export function useSetAccountActive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { userId: string; isActive: boolean }) =>
      accountsService.setProfileActive(input.userId, input.isActive),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.doctors.all }),
  });
}
