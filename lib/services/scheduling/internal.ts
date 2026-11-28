// Shared helpers for the scheduling service modules. Not part of the public API.

import { schedulingLatencyMs } from "@/lib/scheduling-constants";
import { supabase } from "@/lib/supabase";

import { SchedulingError, type SchedulingErrorCode } from "./errors";
import type { AppointmentRow } from "./mappers";

let nextFailure: SchedulingErrorCode | null = null;

export function setNextFailure(code: SchedulingErrorCode): void {
  if (__DEV__) {
    nextFailure = code;
  }
}

/** Optional artificial latency for exercising loading states in dev. */
export function wait(): Promise<void> {
  if (schedulingLatencyMs <= 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    setTimeout(resolve, schedulingLatencyMs);
  });
}

export function consumeFailure(expected?: SchedulingErrorCode): void {
  if (!__DEV__) {
    return;
  }
  if (nextFailure === null || (expected && nextFailure !== expected)) {
    return;
  }

  const code = nextFailure;
  nextFailure = null;
  const messages: Record<SchedulingErrorCode, string> = {
    SESSION_UNAVAILABLE: "That session is full or no longer available.",
    NETWORK_ERROR: "The scheduling service could not be reached.",
    FORBIDDEN: "You are not allowed to do that.",
    INVALID_REQUEST: "That request is not valid right now.",
  };
  throw new SchedulingError(code, messages[code]);
}

/**
 * Maps an unknown/Supabase error to a SchedulingError. Postgres permission
 * errors (RLS / guard triggers) and check violations are surfaced as
 * non-retryable codes instead of NETWORK_ERROR.
 */
export function asNetworkError(error: unknown): never {
  const pgCode =
    error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";
  const message =
    error && typeof error === "object" && "message" in error
      ? String((error as { message?: unknown }).message ?? "")
      : "";

  if (pgCode === "42501") {
    throw new SchedulingError(
      "FORBIDDEN",
      message || "You are not allowed to do that.",
    );
  }
  if (pgCode === "22023" || pgCode === "23514" || pgCode === "23505") {
    throw new SchedulingError(
      "INVALID_REQUEST",
      message || "That request is not valid right now.",
    );
  }
  throw new SchedulingError(
    "NETWORK_ERROR",
    message || "Unexpected scheduling error.",
  );
}

export type SchedulingRpcPayload = {
  success?: boolean;
  code?: string;
  appointment_id?: string;
  created?: number;
  skipped?: number;
  removed?: boolean;
  cancelled_bookings?: number;
  booked?: number;
  queue_number?: number;
  position?: number | null;
  already?: boolean;
  entry_id?: string;
  opens_at?: string;
};

/** "9:30 AM" (today) or "Tue 9:30 AM" for a hospital-local timestamp. */
function formatOpensAt(value: string | undefined): string | null {
  if (!value) {
    return null;
  }
  // A zone-less "yyyy-MM-ddTHH:mm:ss" is read as local (hospital) time.
  const date = new Date(value.replace(" ", "T"));
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  const sameDay = date.toDateString() === new Date().toDateString();
  return date.toLocaleString(undefined, {
    weekday: sameDay ? undefined : "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Error for a `{ success: false, code }` response from a scheduling RPC. */
export function schedulingErrorFromRpc(
  code: string | undefined,
  payload: SchedulingRpcPayload = {},
): SchedulingError {
  switch (code) {
    case "WRONG_CODE":
      return new SchedulingError(
        "INVALID_REQUEST",
        "That isn't the check-in code shown at reception. Check it and try again.",
      );
    case "CHECK_IN_NOT_OPEN": {
      const opens = formatOpensAt(payload.opens_at);
      return new SchedulingError(
        "INVALID_REQUEST",
        opens ? `Check-in opens at ${opens}.` : "Check-in isn't open yet for this session.",
      );
    }
    case "CHECK_IN_CLOSED":
      return new SchedulingError("INVALID_REQUEST", "This session has ended, so check-in is closed.");
    case "NOT_ARRIVED":
      return new SchedulingError("INVALID_REQUEST", "Mark the patient as arrived before calling them in.");
    case "TOO_EARLY":
      return new SchedulingError("INVALID_REQUEST", "This can be recorded once the session has started.");
    case "QUEUE_EMPTY":
      return new SchedulingError("INVALID_REQUEST", "Nobody is waiting yet.");
    case "OUTSIDE_BOOKING_WINDOW":
      return new SchedulingError(
        "INVALID_REQUEST",
        "That session is too far ahead to book yet. Choose an earlier session.",
      );
    case "SESSION_HAS_PLACES":
      return new SchedulingError("INVALID_REQUEST", "This session has places left, so you can book it directly.");
    case "ALREADY_WAITING":
      return new SchedulingError("INVALID_REQUEST", "This person is already on the waitlist for that session.");
    case "WAITLIST_DISABLED":
      return new SchedulingError("INVALID_REQUEST", "The waitlist isn't available right now.");
    case "SESSION_FULL":
      return new SchedulingError(
        "SESSION_UNAVAILABLE",
        "That session just filled up. Choose another session.",
      );
    case "SESSION_UNAVAILABLE":
      return new SchedulingError(
        "SESSION_UNAVAILABLE",
        "That session is no longer available. Choose another session.",
      );
    case "DOCTOR_UNAVAILABLE":
      return new SchedulingError(
        "SESSION_UNAVAILABLE",
        "This doctor isn't taking new bookings right now.",
      );
    case "ALREADY_BOOKED":
      return new SchedulingError(
        "INVALID_REQUEST",
        "This person is already booked into that session.",
      );
    case "NOT_AUTHENTICATED":
      return new SchedulingError(
        "FORBIDDEN",
        "You must be signed in to use scheduling.",
      );
    case "FORBIDDEN":
      return new SchedulingError("FORBIDDEN", "You are not allowed to do that.");
    case "NOT_FOUND":
      return new SchedulingError("INVALID_REQUEST", "That booking or session no longer exists.");
    case "NOT_MODIFIABLE":
      return new SchedulingError(
        "INVALID_REQUEST",
        "This can no longer be changed.",
      );
    case "WRONG_DOCTOR":
      return new SchedulingError(
        "INVALID_REQUEST",
        "A booking can only move to another session with the same doctor.",
      );
    case "CAPACITY_BELOW_BOOKED":
      return new SchedulingError(
        "INVALID_REQUEST",
        "The patient limit can't be lower than the number of patients already booked.",
      );
    case "CANNOT_REMOVE_SELF":
      return new SchedulingError("INVALID_REQUEST", "You can't remove yourself.");
    case "HAS_UPCOMING_VISITS":
      return new SchedulingError(
        "INVALID_REQUEST",
        "This person has upcoming visits. Cancel them first, then remove them.",
      );
    case "BENEFICIARY_REMOVED":
      return new SchedulingError(
        "INVALID_REQUEST",
        "This person was removed from your family members.",
      );
    case "INVALID_INPUT":
      return new SchedulingError(
        "INVALID_REQUEST",
        "Some details are invalid. Check the form and try again.",
      );
    default:
      return new SchedulingError(
        "NETWORK_ERROR",
        "The scheduling service could not be reached.",
      );
  }
}

export async function invokeSchedulingRpc(
  fn:
    | "book_session"
    | "move_session_booking"
    | "cancel_appointment"
    | "create_clinic_sessions"
    | "update_clinic_session"
    | "cancel_clinic_session"
    | "remove_beneficiary"
    | "check_in_visit"
    | "advance_visit"
    | "call_next_in_queue"
    | "get_queue_status"
    | "book_follow_up"
    | "join_waitlist"
    | "leave_waitlist",
  args: Record<string, unknown> = {},
): Promise<SchedulingRpcPayload> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    asNetworkError(error);
  }
  const payload =
    data && typeof data === "object" ? (data as SchedulingRpcPayload) : {};
  if (payload.success === false) {
    throw schedulingErrorFromRpc(payload.code, payload);
  }
  return payload;
}

export async function getCurrentUserId(): Promise<string> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    throw new SchedulingError(
      "FORBIDDEN",
      "You must be signed in to use scheduling.",
    );
  }
  return user.id;
}

export async function getCurrentUserRole(): Promise<string | null> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    asNetworkError(error);
  }
  return (data?.role as string | undefined) ?? null;
}

export async function assertCanManageDoctorSchedule(doctorId: string): Promise<void> {
  const userId = await getCurrentUserId();
  const role = await getCurrentUserRole();

  if (role === "admin") {
    return;
  }
  if (role === "doctor" && userId === doctorId) {
    return;
  }

  throw new SchedulingError(
    "FORBIDDEN",
    "You cannot manage this doctor's schedule.",
  );
}

export function normalizeTimeForDb(timeHm: string): string {
  return timeHm.length === 5 ? `${timeHm}:00` : timeHm;
}

/** Columns every appointment query selects (the session gives the visit window). */
export const APPOINTMENT_SELECT =
  "*, session:clinic_sessions(session_date, start_time, end_time, room, status, cancel_reason)";

export type AppointmentManager = "doctor" | "patient";

export async function fetchAppointmentRow(
  appointmentId: string,
): Promise<AppointmentRow> {
  const { data, error } = await supabase
    .from("appointments")
    .select(APPOINTMENT_SELECT)
    .eq("id", appointmentId)
    .maybeSingle();

  if (error) {
    asNetworkError(error);
  }
  if (!data) {
    throw new SchedulingError(
      "INVALID_REQUEST",
      "Appointment not found.",
    );
  }
  return data as AppointmentRow;
}

export function appointmentManager(
  row: AppointmentRow,
  userId: string,
): AppointmentManager | null {
  if (row.doctor_id === userId) {
    return "doctor";
  }
  if (
    row.account_holder_id === userId ||
    row.patient_id === userId
  ) {
    return "patient";
  }
  return null;
}

export function assertCanManageAppointment(
  row: AppointmentRow,
  userId: string,
): AppointmentManager {
  const manager = appointmentManager(row, userId);
  if (!manager) {
    throw new SchedulingError(
      "FORBIDDEN",
      "You cannot modify this appointment.",
    );
  }
  if (row.status === "cancelled" || row.status === "completed") {
    throw new SchedulingError(
      "INVALID_REQUEST",
      "This appointment can no longer be changed.",
    );
  }
  return manager;
}
