import type { Href } from "expo-router";

import type { Role } from "@/types/scheduling";

/**
 * Where a tapped notification should open. Patients go to the visit it's
 * about; staff go to where they act on it.
 */
export function notificationHref(role: Role, data: Record<string, unknown> | undefined): Href | null {
  const appointmentId = typeof data?.appointmentId === "string" ? data.appointmentId : null;
  if (role === "patient") {
    return appointmentId ? { pathname: "/visit/[id]", params: { id: appointmentId } } : "/visits";
  }
  if (role === "doctor") {
    return "/agenda";
  }
  if (role === "admin") {
    return "/activity";
  }
  return null;
}
