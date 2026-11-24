import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { format } from "date-fns";

import type { DoctorAgendaVisit } from "@/lib/doctor-agenda-helpers";
import { invalidateScheduling, queryKeys } from "@/lib/query/keys";
import {
  schedulingService,
  type AppointmentListFilter,
  type ConfirmBookingInput,
  type ConfirmDoctorAppointmentInput,
} from "@/lib/services/scheduling";
import type { Appointment, SlotHold } from "@/types/scheduling";

/** A patient's (account holder's) appointments. */
export function usePatientAppointments(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.appointments.patient(userId ?? ""),
    queryFn: () => schedulingService.listAppointments(userId!),
    enabled: Boolean(userId),
  });
}

/** A doctor's visits in an inclusive date range, with patient context. */
export function useDoctorAgenda(
  doctorId: string | undefined,
  fromYmd: string,
  toYmd: string,
) {
  return useQuery({
    queryKey: queryKeys.appointments.doctorRange(doctorId ?? "", fromYmd, toYmd),
    enabled: Boolean(doctorId),
    queryFn: async (): Promise<DoctorAgendaVisit[]> => {
      const appointments = await schedulingService.listDoctorAppointments(
        doctorId!,
        { fromYmd, toYmd },
      );
      const contextById =
        await schedulingService.enrichDoctorAgendaVisits(appointments);
      return appointments.flatMap((appointment) => {
        const context = contextById.get(appointment.id);
        if (!appointment.startsAt || !appointment.endsAt || !context) {
          return [];
        }
        return [
          {
            ...appointment,
            startsAt: appointment.startsAt,
            endsAt: appointment.endsAt,
            beneficiaryName: context.beneficiaryName,
            accountHolderName: context.accountHolderName,
            relationship: context.relationship,
            proxyTag: context.proxyTag,
          },
        ];
      });
    },
  });
}

export interface AdminAppointmentRow extends Appointment {
  startsAt: string;
  beneficiaryName: string;
  doctorName: string;
  proxyTag?: string;
}

const ADMIN_PAGE_SIZE = 50;

/** Admin appointment list: server-filtered, newest first, paged. */
export function useAdminAppointments(filter: AppointmentListFilter) {
  return useInfiniteQuery({
    queryKey: queryKeys.appointments.admin(filter),
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const page = await schedulingService.listAppointmentsPage({
        filter,
        todayYmd: format(new Date(), "yyyy-MM-dd"),
        offset: pageParam,
        limit: ADMIN_PAGE_SIZE,
      });
      const contextById = await schedulingService.enrichDoctorAgendaVisits(
        page.items,
      );
      const rows: AdminAppointmentRow[] = page.items.flatMap((appointment) => {
        if (!appointment.startsAt) {
          return [];
        }
        const context = contextById.get(appointment.id);
        return [
          {
            ...appointment,
            startsAt: appointment.startsAt,
            beneficiaryName: context?.beneficiaryName ?? "Patient",
            proxyTag: context?.proxyTag,
          },
        ];
      });
      // Offset counts server rows, not rendered rows (some may be skipped).
      return {
        rows,
        nextOffset: page.hasMore ? pageParam + page.items.length : undefined,
      };
    },
    getNextPageParam: (lastPage) => lastPage.nextOffset,
  });
}

// --------------------------------------------------------------- mutations
// All appointment changes move slots and next-available times too, so they
// invalidate the whole scheduling cache — on success *and* failure, since a
// SLOT_TAKEN / HOLD_EXPIRED error also means what's on screen is out of date.

export function useConfirmBooking() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ConfirmBookingInput) =>
      schedulingService.confirmBooking(input),
    onSettled: () => invalidateScheduling(queryClient),
  });
}

export function useRescheduleAppointment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { appointmentId: string; newSlotId: string; hold: SlotHold }) =>
      schedulingService.rescheduleAppointment(
        input.appointmentId,
        input.newSlotId,
        input.hold,
      ),
    onSettled: () => invalidateScheduling(queryClient),
  });
}

export function useCancelAppointment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (appointmentId: string) =>
      schedulingService.cancelAppointment(appointmentId),
    onSettled: () => invalidateScheduling(queryClient),
  });
}

export function useConfirmDoctorAppointment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      appointmentId: string;
      details?: ConfirmDoctorAppointmentInput;
    }) =>
      schedulingService.confirmDoctorAppointment(input.appointmentId, input.details),
    onSettled: () => invalidateScheduling(queryClient),
  });
}

export function useCompleteDoctorAppointment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (appointmentId: string) =>
      schedulingService.completeDoctorAppointment(appointmentId),
    onSettled: () => invalidateScheduling(queryClient),
  });
}
