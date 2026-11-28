import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { invalidateScheduling, queryKeys } from "@/lib/query/keys";
import { hospitalSettingsService } from "@/lib/services/hospital-settings";

export function useHospitalSettings() {
  return useQuery({
    queryKey: queryKeys.hospitalSettings,
    queryFn: () => hospitalSettingsService.get(),
  });
}

export function useUpdateTimeZone() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (timeZone: string) => hospitalSettingsService.updateTimeZone(timeZone),
    onSuccess: (settings) => {
      queryClient.setQueryData(queryKeys.hospitalSettings, settings);
    },
    // Which sessions count as "ended" depends on the zone.
    onSettled: () => invalidateScheduling(queryClient),
  });
}
