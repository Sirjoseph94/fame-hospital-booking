import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { buildCapacityRow } from "@/lib/admin-capacity";
import { invalidateScheduling, queryKeys } from "@/lib/query/keys";
import {
  schedulingService,
  type CreateAvailabilitySlotInput,
} from "@/lib/services/scheduling";

/** Upcoming bookable slots for one doctor (patient booking / reschedule). */
export function useBookableSlots(doctorId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.slots.bookable(doctorId ?? ""),
    queryFn: () => schedulingService.listSlots(doctorId!),
    enabled: Boolean(doctorId),
    // Availability is contended: always refetch when a screen mounts.
    staleTime: 0,
  });
}

/** Every slot on one day for a doctor's schedule editor. */
export function useScheduleSlots(doctorId: string | undefined, dateYmd: string) {
  return useQuery({
    queryKey: queryKeys.slots.scheduleDay(doctorId ?? "", dateYmd),
    queryFn: () => schedulingService.listScheduleSlotsOnDate(doctorId!, dateYmd),
    enabled: Boolean(doctorId),
  });
}

/** Admin capacity for one day: per-doctor booked/open/blocked counts. */
export function useCapacity(dateYmd: string) {
  return useQuery({
    queryKey: queryKeys.slots.capacityDay(dateYmd),
    queryFn: async () => {
      const doctors = await schedulingService.listDoctors();
      const slotsByDoctor = await schedulingService.listSlotsOnDateForDoctors(
        doctors.map((doctor) => doctor.id),
        dateYmd,
      );
      return doctors
        .map((doctor) => buildCapacityRow(doctor, slotsByDoctor.get(doctor.id) ?? []))
        .sort((left, right) => left.doctorName.localeCompare(right.doctorName));
    },
  });
}

export function useCreateAvailabilitySlot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAvailabilitySlotInput) =>
      schedulingService.createAvailabilitySlot(input),
    onSettled: () => invalidateScheduling(queryClient),
  });
}

export function useRemoveAvailabilitySlot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (slotId: string) => schedulingService.removeAvailabilitySlot(slotId),
    onSettled: () => invalidateScheduling(queryClient),
  });
}
