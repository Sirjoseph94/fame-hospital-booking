import type { QueryClient } from "@tanstack/react-query";

import type { AppointmentListFilter } from "@/lib/services/scheduling";

/**
 * Every query key in the app. Keys are hierarchical so related data can be
 * invalidated together (e.g. `queryKeys.appointments.all`).
 */
export const queryKeys = {
  beneficiaries: (userId: string) => ["beneficiaries", userId] as const,
  appointments: {
    all: ["appointments"] as const,
    patient: (userId: string) => ["appointments", "patient", userId] as const,
    doctorRange: (doctorId: string, fromYmd: string, toYmd: string) =>
      ["appointments", "doctor", doctorId, fromYmd, toYmd] as const,
    admin: (filter: AppointmentListFilter) =>
      ["appointments", "admin", filter] as const,
  },
  doctors: {
    all: ["doctors"] as const,
    list: ["doctors", "list"] as const,
    roster: ["doctors", "roster"] as const,
    detail: (doctorId: string) => ["doctors", "detail", doctorId] as const,
  },
  slots: {
    all: ["slots"] as const,
    bookable: (doctorId: string) => ["slots", "bookable", doctorId] as const,
    scheduleDay: (doctorId: string, dateYmd: string) =>
      ["slots", "schedule", doctorId, dateYmd] as const,
    capacityDay: (dateYmd: string) => ["slots", "capacity", dateYmd] as const,
  },
  blackouts: (doctorId: string) => ["blackouts", doctorId] as const,
  settings: ["settings"] as const,
  profile: {
    patient: (userId: string) => ["profile", "patient", userId] as const,
    doctor: (userId: string) => ["profile", "doctor", userId] as const,
  },
  notificationPreferences: (userId: string) =>
    ["notification-preferences", userId] as const,
  invites: ["invites"] as const,
};

/**
 * After anything that changes bookings or availability: appointments, slots
 * and doctors' next-available times can all be affected.
 */
export function invalidateScheduling(queryClient: QueryClient): Promise<void> {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.appointments.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.slots.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.doctors.all }),
  ]).then(() => undefined);
}
