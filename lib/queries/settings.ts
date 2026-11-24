import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query/keys";
import { schedulingService } from "@/lib/services/scheduling";

/** Hospital-wide scheduling settings (post-visit buffer). */
export function useSchedulingSettings() {
  return useQuery({
    queryKey: queryKeys.settings,
    queryFn: () => schedulingService.getSettings(),
    staleTime: 5 * 60_000,
  });
}

export function useUpdateBufferMinutes() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (minutes: number) => schedulingService.updateBufferMinutes(minutes),
    onSuccess: (settings) => {
      queryClient.setQueryData(queryKeys.settings, settings);
    },
    // The buffer changes which slots are bookable.
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.slots.all }),
  });
}
