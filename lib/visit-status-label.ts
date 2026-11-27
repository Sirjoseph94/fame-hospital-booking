import { isValid, parseISO } from "date-fns";

import type { AppointmentDbStatus, AppointmentStatus } from "@/types/scheduling";

/** Who is reading the label; wording differs for an unconfirmed visit. */
export type VisitStatusAudience = "patient" | "doctor" | "admin";

const PENDING_LABEL: Record<VisitStatusAudience, string> = {
  patient: "Awaiting confirmation",
  doctor: "Needs confirmation",
  admin: "Pending",
};

// A pending visit whose start time has passed is no longer "awaiting" anything
// from the patient's point of view. Doctors can still confirm it (pending can
// only move to confirmed or cancelled), so their wording stays actionable.
const PAST_PENDING_LABEL: Record<VisitStatusAudience, string> = {
  patient: "Not confirmed",
  doctor: "Needs confirmation",
  admin: "Not confirmed",
};

// When the DB status isn't pending/confirmed. Doctors only ever see visits on
// their schedule, so anything not awaiting them reads as confirmed.
const FALLBACK_LABEL: Record<VisitStatusAudience, string> = {
  patient: "Upcoming",
  doctor: "Confirmed",
  admin: "Upcoming",
};

function hasStarted(startsAt: string | undefined, now: Date): boolean {
  if (!startsAt) {
    return false;
  }
  const start = parseISO(startsAt);
  return isValid(start) && start.getTime() <= now.getTime();
}

/** Human-readable status for a visit, worded for the given audience. */
export function visitStatusLabel(
  status: AppointmentStatus,
  dbStatus: AppointmentDbStatus | undefined,
  audience: VisitStatusAudience,
  startsAt?: string,
  now: Date = new Date(),
): string {
  if (status === "completed") {
    return "Completed";
  }
  if (status === "cancelled") {
    return "Cancelled";
  }
  if (dbStatus === "pending") {
    return hasStarted(startsAt, now)
      ? PAST_PENDING_LABEL[audience]
      : PENDING_LABEL[audience];
  }
  if (dbStatus === "confirmed") {
    return "Confirmed";
  }
  return FALLBACK_LABEL[audience];
}
