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
  sessions: {
    all: ["sessions"] as const,
    bookable: (doctorId: string) => ["sessions", "bookable", doctorId] as const,
    doctorRange: (doctorId: string, fromYmd: string, toYmd: string) =>
      ["sessions", "doctor", doctorId, fromYmd, toYmd] as const,
    day: (dateYmd: string) => ["sessions", "day", dateYmd] as const,
  },
  profile: {
    patient: (userId: string) => ["profile", "patient", userId] as const,
    doctor: (userId: string) => ["profile", "doctor", userId] as const,
  },
  notificationPreferences: (userId: string) =>
    ["notification-preferences", userId] as const,
  invites: ["invites"] as const,
};

/**
 * After anything that changes bookings or sessions: appointments, session
 * places and doctors' next open session can all be affected.
 */
export function invalidateScheduling(queryClient: QueryClient): Promise<void> {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.appointments.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.doctors.all }),
  ]).then(() => undefined);
}
