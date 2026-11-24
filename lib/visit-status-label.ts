import type { AppointmentDbStatus, AppointmentStatus } from "@/types/scheduling";

/** Who is reading the label; wording differs for an unconfirmed visit. */
export type VisitStatusAudience = "patient" | "doctor" | "admin";

const PENDING_LABEL: Record<VisitStatusAudience, string> = {
  patient: "Awaiting confirmation",
  doctor: "Needs confirmation",
  admin: "Pending",
};

// When the DB status isn't pending/confirmed. Doctors only ever see visits on
// their schedule, so anything not awaiting them reads as confirmed.
const FALLBACK_LABEL: Record<VisitStatusAudience, string> = {
  patient: "Upcoming",
  doctor: "Confirmed",
  admin: "Upcoming",
};

/** Human-readable status for a visit, worded for the given audience. */
export function visitStatusLabel(
  status: AppointmentStatus,
  dbStatus: AppointmentDbStatus | undefined,
  audience: VisitStatusAudience,
): string {
  if (status === "completed") {
    return "Completed";
  }
  if (status === "cancelled") {
    return "Cancelled";
  }
  if (dbStatus === "pending") {
    return PENDING_LABEL[audience];
  }
  if (dbStatus === "confirmed") {
    return "Confirmed";
  }
  return FALLBACK_LABEL[audience];
}
