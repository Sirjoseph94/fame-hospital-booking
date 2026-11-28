import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { DoctorAgendaVisit } from "@/lib/doctor-agenda-helpers";
import { invalidateScheduling, queryKeys } from "@/lib/query/keys";
import { reportsService } from "@/lib/services/reports";
import { schedulingService, visitFlowService, type VisitAction } from "@/lib/services/scheduling";

/** How often live queue screens refresh while open. */
export const QUEUE_REFRESH_MS = 20_000;

/** A patient's place in line; polls while `live` (checked in, waiting). */
export function useQueueStatus(appointmentId: string | undefined, options: { enabled: boolean; live: boolean }) {
  return useQuery({
    queryKey: queryKeys.queueStatus(appointmentId ?? ""),
    queryFn: () => visitFlowService.getQueueStatus(appointmentId!),
    enabled: Boolean(appointmentId) && options.enabled,
    refetchInterval: options.live ? QUEUE_REFRESH_MS : false,
    staleTime: 10_000,
  });
}

export function useCheckIn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { appointmentId: string; code?: string }) =>
      visitFlowService.checkIn(input.appointmentId, input.code),
    onSettled: () => invalidateScheduling(queryClient),
  });
}

export function useAdvanceVisit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { appointmentId: string; action: VisitAction }) =>
      visitFlowService.advance(input.appointmentId, input.action),
    onSettled: () => invalidateScheduling(queryClient),
  });
}

export function useCallNext() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => visitFlowService.callNext(sessionId),
    onSettled: () => invalidateScheduling(queryClient),
  });
}

export function useBookFollowUp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { appointmentId: string; sessionId: string; note?: string }) =>
      visitFlowService.bookFollowUp(input.appointmentId, input.sessionId, input.note),
    onSettled: () => invalidateScheduling(queryClient),
  });
}

/** Staff: how each session on a day is going. Polls while `live`. */
export function useSessionProgress(dateYmd: string, options: { live?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.sessionProgress(dateYmd),
    queryFn: () => visitFlowService.listSessionProgress(dateYmd),
    refetchInterval: options.live ? QUEUE_REFRESH_MS : false,
  });
}

export function useMyWaitlist(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.waitlist.mine(userId ?? ""),
    queryFn: () => visitFlowService.listMyWaitlist(),
    enabled: Boolean(userId),
  });
}

export function useJoinWaitlist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { sessionId: string; beneficiaryId: string; reason?: string; notes?: string }) =>
      visitFlowService.joinWaitlist(input),
    onSettled: () => invalidateScheduling(queryClient),
  });
}

export function useLeaveWaitlist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (entryId: string) => visitFlowService.leaveWaitlist(entryId),
    onSettled: () => invalidateScheduling(queryClient),
  });
}

/** Admin: attendance report for an inclusive date range. */
export function useVisitReport(fromYmd: string, toYmd: string) {
  return useQuery({
    queryKey: queryKeys.reports(fromYmd, toYmd),
    queryFn: () => reportsService.visitReport(fromYmd, toYmd),
    staleTime: 60_000,
  });
}

/** Staff: one session and its bookings (admin session queue). Polls while `live`. */
export function useSessionQueue(sessionId: string | undefined, options: { live?: boolean } = {}) {
  return useQuery({
    queryKey: [...queryKeys.appointments.all, "session", sessionId ?? ""],
    enabled: Boolean(sessionId),
    refetchInterval: options.live ? QUEUE_REFRESH_MS : false,
    queryFn: async () => {
      const [session, appointments] = await Promise.all([
        schedulingService.getSession(sessionId!),
        schedulingService.listSessionAppointments(sessionId!),
      ]);
      const [context, doctor] = await Promise.all([
        schedulingService.enrichDoctorAgendaVisits(appointments),
        schedulingService.getDoctor(session.doctorId).catch(() => null),
      ]);
      const visits: DoctorAgendaVisit[] = appointments.flatMap((appointment) => {
        const row = context.get(appointment.id);
        if (!appointment.startsAt || !appointment.endsAt || !row) return [];
        return [{ ...appointment, startsAt: appointment.startsAt, endsAt: appointment.endsAt, ...row }];
      });
      return { session, visits, doctorName: doctor?.name ?? "Doctor" };
    },
  });
}
