import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query/keys";
import {
  notificationsService,
  type NotificationPreferences,
} from "@/lib/services/notifications";
import { profileService } from "@/lib/services/profile";
import type { NotificationPreferencesFields } from "@/lib/validation/notifications";
import type {
  UpdateDoctorProfileInput,
  UpdatePatientProfileInput,
} from "@/types/profile";

export function usePatientProfile(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.profile.patient(userId ?? ""),
    queryFn: () => profileService.getPatientProfile(userId!),
    enabled: Boolean(userId),
  });
}

export function useUpdatePatientProfile(userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdatePatientProfileInput) =>
      profileService.updatePatientProfile(userId, input),
    onSuccess: (profile) => {
      queryClient.setQueryData(queryKeys.profile.patient(userId), profile);
    },
  });
}

export function useDoctorProfile(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.profile.doctor(userId ?? ""),
    queryFn: () => profileService.getDoctorProfile(userId!),
    enabled: Boolean(userId),
  });
}

export function useUpdateDoctorProfile(userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateDoctorProfileInput) =>
      profileService.updateDoctorProfile(userId, input),
    onSuccess: (profile) => {
      queryClient.setQueryData(queryKeys.profile.doctor(userId), profile);
    },
    // Name / specialty appear in doctor lists.
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.doctors.all }),
  });
}

export function useNotificationPreferences(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.notificationPreferences(userId ?? ""),
    queryFn: () => notificationsService.getNotificationPreferences(userId!),
    enabled: Boolean(userId),
  });
}

export function useUpdateNotificationPreferences(userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: NotificationPreferencesFields) =>
      notificationsService.updateNotificationPreferences(userId, input),
    onSuccess: (saved: NotificationPreferences) => {
      queryClient.setQueryData(queryKeys.notificationPreferences(userId), saved);
    },
  });
}
