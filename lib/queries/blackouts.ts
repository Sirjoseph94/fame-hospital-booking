import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { invalidateScheduling, queryKeys } from "@/lib/query/keys";
import { schedulingService, type SetBlackoutInput } from "@/lib/services/scheduling";

export function useBlackouts(doctorId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.blackouts(doctorId ?? ""),
    queryFn: () => schedulingService.listBlackouts(doctorId!),
    enabled: Boolean(doctorId),
  });
}

// Blackouts mark overlapping slots unavailable (and deleting frees them), so
// they also invalidate slots / next-available times.

export function useSetBlackout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SetBlackoutInput) => schedulingService.setBlackout(input),
    onSettled: (_data, _error, input) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.blackouts(input.doctorId) }),
        invalidateScheduling(queryClient),
      ]),
  });
}

export function useDeleteBlackout(doctorId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (blackoutId: string) => schedulingService.deleteBlackout(blackoutId),
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.blackouts(doctorId) }),
        invalidateScheduling(queryClient),
      ]),
  });
}
