import type { AppointmentDbStatus, AppointmentStatus } from "@/types/scheduling";

export function visitStatusBadgeLabel(
  status: AppointmentStatus,
  dbStatus?: AppointmentDbStatus,
): string {
  if (status === "completed") {
    return "Completed";
  }
  if (status === "cancelled") {
    return "Cancelled";
  }
  if (dbStatus === "pending") {
    return "Awaiting confirmation";
  }
  if (dbStatus === "confirmed") {
    return "Confirmed";
  }
  return "Upcoming";
}
