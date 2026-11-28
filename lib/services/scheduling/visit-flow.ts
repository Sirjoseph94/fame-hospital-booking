// The day of the visit: check-in, the arrival queue, follow-ups, and waitlists.

import { supabase } from "@/lib/supabase";
import type {
  AppointmentDbStatus,
  QueueStatus,
  SessionProgress,
  WaitlistEntry,
} from "@/types/scheduling";

import { SchedulingError } from "./errors";
import {
  asNetworkError,
  consumeFailure,
  fetchAppointmentRow,
  invokeSchedulingRpc,
  schedulingErrorFromRpc,
  wait,
} from "./internal";
import { localIso, mapAppointment } from "./mappers";

/** Staff actions on one booked patient (see advance_visit in the database). */
export type VisitAction = "arrive" | "call" | "complete" | "no_show" | "requeue";

export interface CheckInResult {
  queueNumber: number;
  /** Place in line (1 = next), or undefined if already called. */
  position?: number;
  /** They had already checked in. */
  already: boolean;
}

function rethrow(error: unknown): never {
  if (error instanceof SchedulingError) {
    throw error;
  }
  asNetworkError(error);
}

const PROGRESS_COLUMNS =
  "session_id, doctor_id, session_date, start_time, end_time, capacity, room, status, booked, not_arrived, waiting, with_doctor, seen, no_show, cancelled";

interface ProgressRow {
  session_id: string;
  doctor_id: string;
  session_date: string;
  start_time: string;
  end_time: string;
  capacity: number;
  room: string | null;
  status: string;
  booked: number;
  not_arrived: number;
  waiting: number;
  with_doctor: number;
  seen: number;
  no_show: number;
  cancelled: number;
}

function mapProgress(row: ProgressRow): SessionProgress {
  return {
    sessionId: row.session_id,
    doctorId: row.doctor_id,
    dateYmd: row.session_date,
    startsAt: localIso(row.session_date, row.start_time),
    endsAt: localIso(row.session_date, row.end_time),
    capacity: row.capacity,
    room: row.room ?? undefined,
    status: row.status === "cancelled" ? "cancelled" : "scheduled",
    booked: row.booked,
    notArrived: row.not_arrived,
    waiting: row.waiting,
    withDoctor: row.with_doctor,
    seen: row.seen,
    noShow: row.no_show,
    cancelled: row.cancelled,
  };
}

interface WaitlistRow {
  id: string;
  session_id: string;
  beneficiary_id: string;
  doctor_id: string;
  session_date: string;
  start_time: string;
  end_time: string;
  room: string | null;
  position: number;
}

/** Normalises what people type or scan: "abc-123" → "ABC123". */
export function normalizeCheckInCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * The check-in code from a scanned QR: the poster encodes
 * `fame-hospital://check-in?code=ABC123`, but a bare code works too.
 */
export function checkInCodeFromScan(data: string): string | null {
  const trimmed = data.trim();
  const match = /[?&]code=([^&#\s]+)/i.exec(trimmed);
  const code = normalizeCheckInCode(match ? decodeURIComponent(match[1]!) : trimmed);
  return /^[A-Z2-9]{6}$/.test(code) ? code : null;
}

export const visitFlowService = {
  /** Patient (with the reception code) or staff (no code) checks a visit in. */
  async checkIn(appointmentId: string, code?: string): Promise<CheckInResult> {
    await wait();
    consumeFailure("NETWORK_ERROR");
    try {
      const payload = await invokeSchedulingRpc("check_in_visit", {
        p_appointment_id: appointmentId,
        p_code: code ? normalizeCheckInCode(code) : null,
      });
      return {
        queueNumber: payload.queue_number ?? 0,
        position: payload.position ?? undefined,
        already: payload.already === true,
      };
    } catch (error) {
      rethrow(error);
    }
  },

  async advance(appointmentId: string, action: VisitAction): Promise<void> {
    await wait();
    consumeFailure("NETWORK_ERROR");
    try {
      await invokeSchedulingRpc("advance_visit", {
        p_appointment_id: appointmentId,
        p_action: action,
      });
    } catch (error) {
      rethrow(error);
    }
  },

  /** Calls the first patient in line; returns their appointment id. */
  async callNext(sessionId: string): Promise<string> {
    await wait();
    consumeFailure("NETWORK_ERROR");
    try {
      const payload = await invokeSchedulingRpc("call_next_in_queue", { p_session_id: sessionId });
      return payload.appointment_id ?? "";
    } catch (error) {
      rethrow(error);
    }
  },

  async getQueueStatus(appointmentId: string): Promise<QueueStatus> {
    try {
      const { data, error } = await supabase.rpc("get_queue_status", {
        p_appointment_id: appointmentId,
      });
      if (error) {
        asNetworkError(error);
      }
      const row = (data ?? {}) as Record<string, unknown>;
      if (row.success === false) {
        throw schedulingErrorFromRpc(typeof row.code === "string" ? row.code : undefined);
      }
      const str = (key: string) => (typeof row[key] === "string" ? (row[key] as string) : undefined);
      const num = (key: string) => (typeof row[key] === "number" ? (row[key] as number) : undefined);
      return {
        dbStatus: (str("status") ?? "confirmed") as AppointmentDbStatus,
        checkedInAt: str("checked_in_at"),
        queueNumber: num("queue_number"),
        calledAt: str("called_at"),
        position: num("position"),
        waiting: num("waiting") ?? 0,
        nowServing: num("now_serving"),
      };
    } catch (error) {
      rethrow(error);
    }
  },

  /** Doctor/admin books the same patient into a future session of this doctor. */
  async bookFollowUp(appointmentId: string, sessionId: string, note?: string) {
    await wait();
    consumeFailure("NETWORK_ERROR");
    try {
      const payload = await invokeSchedulingRpc("book_follow_up", {
        p_appointment_id: appointmentId,
        p_session_id: sessionId,
        p_note: note?.trim() || null,
      });
      if (!payload.appointment_id) {
        throw new SchedulingError("NETWORK_ERROR", "The scheduling service could not be reached.");
      }
      return mapAppointment(await fetchAppointmentRow(payload.appointment_id));
    } catch (error) {
      rethrow(error);
    }
  },

  /** Staff: per-session counts for one day. */
  async listSessionProgress(dateYmd: string): Promise<SessionProgress[]> {
    try {
      const { data, error } = await supabase
        .from("clinic_session_progress")
        .select(PROGRESS_COLUMNS)
        .eq("session_date", dateYmd)
        .order("start_time", { ascending: true });
      if (error) {
        asNetworkError(error);
      }
      return ((data ?? []) as ProgressRow[]).map(mapProgress);
    } catch (error) {
      rethrow(error);
    }
  },

  async joinWaitlist(input: {
    sessionId: string;
    beneficiaryId: string;
    reason?: string;
    notes?: string;
  }): Promise<{ entryId: string; position: number }> {
    await wait();
    consumeFailure("NETWORK_ERROR");
    try {
      const payload = await invokeSchedulingRpc("join_waitlist", {
        p_session_id: input.sessionId,
        p_beneficiary_id: input.beneficiaryId,
        p_reason: input.reason?.trim() || null,
        p_notes: input.notes?.trim() || null,
      });
      return { entryId: payload.entry_id ?? "", position: payload.position ?? 1 };
    } catch (error) {
      rethrow(error);
    }
  },

  async leaveWaitlist(entryId: string): Promise<void> {
    await wait();
    consumeFailure("NETWORK_ERROR");
    try {
      await invokeSchedulingRpc("leave_waitlist", { p_entry_id: entryId });
    } catch (error) {
      rethrow(error);
    }
  },

  /** The signed-in account holder's waitlist places that are still waiting. */
  async listMyWaitlist(): Promise<WaitlistEntry[]> {
    try {
      const { data, error } = await supabase
        .from("my_waitlist_entries")
        .select("id, session_id, beneficiary_id, doctor_id, session_date, start_time, end_time, room, position")
        .order("session_date", { ascending: true })
        .order("start_time", { ascending: true });
      if (error) {
        asNetworkError(error);
      }
      return ((data ?? []) as WaitlistRow[]).map((row) => ({
        id: row.id,
        sessionId: row.session_id,
        beneficiaryId: row.beneficiary_id,
        doctorId: row.doctor_id,
        startsAt: localIso(row.session_date, row.start_time),
        endsAt: localIso(row.session_date, row.end_time),
        room: row.room ?? undefined,
        position: row.position,
      }));
    } catch (error) {
      rethrow(error);
    }
  },
};
