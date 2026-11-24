// Shared helpers for the scheduling service modules. Not part of the public API.

import { format, parseISO, subDays } from "date-fns";

import { schedulingLatencyMs } from "@/lib/scheduling-constants";
import { supabase } from "@/lib/supabase";
import type { SlotHold } from "@/types/scheduling";

import { SchedulingError, type SchedulingErrorCode } from "./errors";
import type { AppointmentRow, SlotRow } from "./mappers";

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
    SLOT_TAKEN: "That appointment time was just taken.",
    HOLD_EXPIRED: "Your five-minute slot hold has expired.",
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

export type SlotRpcPayload = {
  success?: boolean;
  code?: string;
  expires_at?: string;
  appointment_id?: string;
};

export function schedulingErrorFromSlotRpc(code: string | undefined): SchedulingError {
  if (code === "HOLD_EXPIRED") {
    return new SchedulingError(
      "HOLD_EXPIRED",
      "Your five-minute slot hold has expired.",
    );
  }
  if (code === "SLOT_TAKEN" || code === "SLOT_IN_USE") {
    return new SchedulingError(
      "SLOT_TAKEN",
      "That appointment time was just taken.",
    );
  }
  if (code === "NOT_AUTHENTICATED") {
    return new SchedulingError(
      "FORBIDDEN",
      "You must be signed in to use scheduling.",
    );
  }
  if (code === "FORBIDDEN") {
    return new SchedulingError(
      "FORBIDDEN",
      "You cannot modify this appointment.",
    );
  }
  if (code === "NOT_FOUND") {
    return new SchedulingError("INVALID_REQUEST", "Appointment not found.");
  }
  if (code === "NOT_MODIFIABLE") {
    return new SchedulingError(
      "INVALID_REQUEST",
      "This appointment can no longer be changed.",
    );
  }
  if (code === "WRONG_DOCTOR") {
    return new SchedulingError(
      "INVALID_REQUEST",
      "Reschedule must stay with the same doctor.",
    );
  }
  if (code === "INVALID_INPUT") {
    return new SchedulingError(
      "INVALID_REQUEST",
      "Some booking details are invalid. Check the form and try again.",
    );
  }
  return new SchedulingError(
    "NETWORK_ERROR",
    "The scheduling service could not be reached.",
  );
}

export function parseSlotRpcPayload(data: unknown): SlotRpcPayload {
  if (!data || typeof data !== "object") {
    return {};
  }
  return data as SlotRpcPayload;
}

export async function invokeSlotRpc(
  fn:
    | "cleanup_expired_slot_holds"
    | "hold_slot_if_available"
    | "release_slot_hold"
    | "book_held_slot"
    | "free_orphan_booked_slot"
    | "book_appointment_from_hold"
    | "reschedule_appointment"
    | "cancel_appointment",
  args: Record<string, unknown> = {},
): Promise<SlotRpcPayload> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    asNetworkError(error);
  }
  const payload = parseSlotRpcPayload(data);
  if (payload.success === false) {
    throw schedulingErrorFromSlotRpc(payload.code);
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

export async function cleanupExpiredHolds(): Promise<void> {
  try {
    await invokeSlotRpc("cleanup_expired_slot_holds");
  } catch {
    // Best-effort; listing slots should still proceed.
  }
}

export async function fetchBufferMinutes(): Promise<number> {
  const { data, error } = await supabase
    .from("hospital_settings")
    .select("buffer_minutes")
    .eq("id", 1)
    .maybeSingle();

  if (error || !data) {
    return 15;
  }
  return Math.max(0, data.buffer_minutes as number);
}

/** "yyyy-MM-dd" for the day before `ymd`. */
export function previousYmd(ymd: string): string {
  return format(subDays(parseISO(ymd), 1), "yyyy-MM-dd");
}

/**
 * End times of booked slots per doctor, for applying the post-visit buffer.
 * Bounded by date: pass the day *before* the first day you're listing as
 * `fromYmd`, since a late booking can push its buffer past midnight.
 */
export async function bookedEndsByDoctor(
  doctorIds: string[],
  fromYmd: string,
  toYmd?: string,
): Promise<Map<string, string[]>> {
  const byDoctor = new Map<string, string[]>();
  if (doctorIds.length === 0) {
    return byDoctor;
  }

  let query = supabase
    .from("appointment_slots")
    .select("doctor_id, slot_date, end_time")
    .in("doctor_id", doctorIds)
    .eq("status", "booked")
    .gte("slot_date", fromYmd);
  if (toYmd) {
    query = query.lte("slot_date", toYmd);
  }
  const { data, error } = await query;

  if (error || !data) {
    return byDoctor;
  }

  (data as Pick<SlotRow, "doctor_id" | "slot_date" | "end_time">[]).forEach((row) => {
    const endTime =
      row.end_time.length === 5 ? `${row.end_time}:00` : row.end_time;
    const ends = byDoctor.get(row.doctor_id) ?? [];
    ends.push(parseISO(`${row.slot_date}T${endTime}`).toISOString());
    byDoctor.set(row.doctor_id, ends);
  });
  return byDoctor;
}

export async function bookedEndsForDoctor(
  doctorId: string,
  fromYmd: string,
  toYmd?: string,
): Promise<string[]> {
  return (await bookedEndsByDoctor([doctorId], fromYmd, toYmd)).get(doctorId) ?? [];
}

/** Postgres / PostgREST often round-trip timestamptz without ms or with +00:00 vs Z. */
export function holdExpiryMs(iso: string): number {
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

export function holdExpiryMatches(clientIso: string, serverIso: string): boolean {
  return Math.abs(holdExpiryMs(clientIso) - holdExpiryMs(serverIso)) <= 2000;
}

export type AppointmentManager = "doctor" | "patient";

export async function fetchAppointmentRow(
  appointmentId: string,
): Promise<AppointmentRow> {
  const { data, error } = await supabase
    .from("appointments")
    .select("*, appointment_slots(slot_date, start_time, end_time)")
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

export function appointmentVisitDateYmd(row: AppointmentRow): string {
  const slot = row.appointment_slots;
  const slotRow = Array.isArray(slot) ? slot[0] : slot;
  if (slotRow?.slot_date) {
    return slotRow.slot_date as string;
  }
  return row.appointment_date;
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

export function assertValidHold(
  slotId: string,
  hold: SlotHold,
  activeHold: SlotHold | null,
  heldByUserId?: string | null,
  currentUserId?: string,
): void {
  consumeFailure("HOLD_EXPIRED");

  if (
    !activeHold ||
    activeHold.slotId !== slotId ||
    hold.slotId !== slotId
  ) {
    throw new SchedulingError(
      "HOLD_EXPIRED",
      "Your five-minute slot hold has expired.",
    );
  }

  if (
    currentUserId &&
    heldByUserId &&
    heldByUserId !== currentUserId
  ) {
    throw new SchedulingError(
      "SLOT_TAKEN",
      "That appointment time was just taken.",
    );
  }

  const serverExpiresMs = holdExpiryMs(activeHold.expiresAt);
  if (serverExpiresMs <= Date.now()) {
    throw new SchedulingError(
      "HOLD_EXPIRED",
      "Your five-minute slot hold has expired.",
    );
  }

  if (!holdExpiryMatches(hold.expiresAt, activeHold.expiresAt)) {
    throw new SchedulingError(
      "HOLD_EXPIRED",
      "Your five-minute slot hold has expired.",
    );
  }
}
