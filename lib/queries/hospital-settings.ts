import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { invalidateScheduling, queryKeys } from "@/lib/query/keys";
import {
  hospitalSettingsService,
  type EditableSettings,
} from "@/lib/services/hospital-settings";

export function useHospitalSettings(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.hospitalSettings,
    queryFn: () => hospitalSettingsService.get(),
    staleTime: 5 * 60_000,
    enabled: options.enabled ?? true,
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
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.auditLog });
      return invalidateScheduling(queryClient);
    },
  });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (settings: EditableSettings) => hospitalSettingsService.update(settings),
    onSuccess: (settings) => {
      queryClient.setQueryData(queryKeys.hospitalSettings, settings);
      void queryClient.invalidateQueries({ queryKey: queryKeys.auditLog });
    },
    // The booking window changes which sessions are bookable.
    onSettled: () => invalidateScheduling(queryClient),
  });
}

/** Admin: the reception check-in code. */
export function useCheckInCode(enabled = true) {
  return useQuery({
    queryKey: queryKeys.checkInCode,
    queryFn: () => hospitalSettingsService.getCheckInCode(),
    enabled,
  });
}

export function useRotateCheckInCode() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => hospitalSettingsService.rotateCheckInCode(),
    onSuccess: (code) => {
      queryClient.setQueryData(queryKeys.checkInCode, code);
      void queryClient.invalidateQueries({ queryKey: queryKeys.auditLog });
    },
  });
}
