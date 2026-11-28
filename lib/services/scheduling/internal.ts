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
};

/** Error for a `{ success: false, code }` response from a scheduling RPC. */
export function schedulingErrorFromRpc(code: string | undefined): SchedulingError {
  switch (code) {
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
    | "remove_beneficiary",
  args: Record<string, unknown> = {},
): Promise<SchedulingRpcPayload> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    asNetworkError(error);
  }
  const payload =
    data && typeof data === "object" ? (data as SchedulingRpcPayload) : {};
  if (payload.success === false) {
    throw schedulingErrorFromRpc(payload.code);
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
