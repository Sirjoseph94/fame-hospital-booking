import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { buildCapacityRows } from "@/lib/admin-capacity";
import { invalidateScheduling, queryKeys } from "@/lib/query/keys";
import {
  schedulingService,
  type CreateSessionsInput,
} from "@/lib/services/scheduling";

/** Upcoming sessions with places left for one doctor (booking / moving). */
export function useBookableSessions(doctorId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.sessions.bookable(doctorId ?? ""),
    queryFn: () => schedulingService.listBookableSessions(doctorId!),
    enabled: Boolean(doctorId),
    // Places are contended: always refetch when a screen mounts.
    staleTime: 0,
  });
}

/** Every session for one doctor in an inclusive date range (schedule, agenda). */
export function useDoctorSessions(
  doctorId: string | undefined,
  fromYmd: string,
  toYmd: string,
) {
  return useQuery({
    queryKey: queryKeys.sessions.doctorRange(doctorId ?? "", fromYmd, toYmd),
    queryFn: () =>
      schedulingService.listDoctorSessions(doctorId!, { fromYmd, toYmd }),
    enabled: Boolean(doctorId),
  });
}

/** Admin capacity for one day: each doctor's sessions and how full they are. */
export function useCapacity(dateYmd: string) {
  return useQuery({
    queryKey: queryKeys.sessions.day(dateYmd),
    queryFn: async () => {
      const [doctors, sessions] = await Promise.all([
        schedulingService.listDoctors(),
        schedulingService.listSessionsOnDate(dateYmd),
      ]);
      return buildCapacityRows(doctors, sessions);
    },
  });
}

export function useCreateSessions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSessionsInput) =>
      schedulingService.createSessions(input),
    onSettled: () => invalidateScheduling(queryClient),
  });
}

export function useCancelSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { sessionId: string; reason?: string }) =>
      schedulingService.cancelSession(input.sessionId, input.reason),
    onSettled: () => invalidateScheduling(queryClient),
  });
}
