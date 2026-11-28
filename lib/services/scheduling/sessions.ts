// Clinic sessions: listing availability, creating and cancelling sessions.

import { supabase } from "@/lib/supabase";

import { SchedulingError } from "./errors";
import {
  asNetworkError,
  consumeFailure,
  invokeSchedulingRpc,
  normalizeTimeForDb,
  wait,
} from "./internal";
import { mapSession, type SessionAvailabilityRow } from "./mappers";
import type { SchedulingService } from "./types";

const SESSION_COLUMNS =
  "session_id, doctor_id, session_date, start_time, end_time, capacity, status, cancel_reason, booked_count, places_left, is_bookable, room, waitlist_count, in_booking_window";

/** Most sessions listed for one doctor when booking (the window caps the dates). */
const BOOKABLE_LIMIT = 120;

function rethrow(error: unknown): never {
  if (error instanceof SchedulingError) {
    throw error;
  }
  asNetworkError(error);
}

export const sessionsMethods: Pick<
  SchedulingService,
  | "listBookableSessions"
  | "listDoctorSessions"
  | "listSessionsOnDate"
  | "getSession"
  | "createSessions"
  | "cancelSession"
  | "updateSession"
> = {
  async listBookableSessions(doctorId) {
    await wait();
    consumeFailure("NETWORK_ERROR");

    try {
      const { data, error } = await supabase
        .from("clinic_session_availability")
        .select(SESSION_COLUMNS)
        .eq("doctor_id", doctorId)
        .eq("in_booking_window", true)
        .order("session_date", { ascending: true })
        .order("start_time", { ascending: true })
        .limit(BOOKABLE_LIMIT);

      if (error) {
        asNetworkError(error);
      }
      return ((data ?? []) as SessionAvailabilityRow[]).map(mapSession);
    } catch (error) {
      rethrow(error);
    }
  },
  async listDoctorSessions(doctorId, { fromYmd, toYmd }) {
    await wait();
    consumeFailure("NETWORK_ERROR");

    try {
      const { data, error } = await supabase
        .from("clinic_session_availability")
        .select(SESSION_COLUMNS)
        .eq("doctor_id", doctorId)
        .gte("session_date", fromYmd)
        .lte("session_date", toYmd)
        .order("session_date", { ascending: true })
        .order("start_time", { ascending: true });

      if (error) {
        asNetworkError(error);
      }
      return ((data ?? []) as SessionAvailabilityRow[]).map(mapSession);
    } catch (error) {
      rethrow(error);
    }
  },
  async listSessionsOnDate(dateYmd) {
    await wait();
    consumeFailure("NETWORK_ERROR");

    try {
      const { data, error } = await supabase
        .from("clinic_session_availability")
        .select(SESSION_COLUMNS)
        .eq("session_date", dateYmd)
        .order("start_time", { ascending: true });

      if (error) {
        asNetworkError(error);
      }
      return ((data ?? []) as SessionAvailabilityRow[]).map(mapSession);
    } catch (error) {
      rethrow(error);
    }
  },
  async getSession(sessionId) {
    try {
      const { data, error } = await supabase
        .from("clinic_session_availability")
        .select(SESSION_COLUMNS)
        .eq("session_id", sessionId)
        .maybeSingle();
      if (error) {
        asNetworkError(error);
      }
      if (!data) {
        throw new SchedulingError("INVALID_REQUEST", "That session no longer exists.");
      }
      return mapSession(data as SessionAvailabilityRow);
    } catch (error) {
      rethrow(error);
    }
  },
  async createSessions(input) {
    await wait();
    consumeFailure("NETWORK_ERROR");

    try {
      const payload = await invokeSchedulingRpc("create_clinic_sessions", {
        p_doctor_id: input.doctorId,
        p_first_date: input.firstDateYmd,
        p_weeks: input.weeks,
        p_weekdays: input.weekdays,
        p_start_time: normalizeTimeForDb(input.startTime),
        p_end_time: normalizeTimeForDb(input.endTime),
        p_capacity: input.capacity,
        p_room: input.room?.trim() || null,
      });
      return { created: payload.created ?? 0, skipped: payload.skipped ?? 0 };
    } catch (error) {
      rethrow(error);
    }
  },
  async cancelSession(sessionId, reason) {
    await wait();
    consumeFailure("NETWORK_ERROR");

    try {
      const payload = await invokeSchedulingRpc("cancel_clinic_session", {
        p_session_id: sessionId,
        p_reason: reason?.trim() || null,
      });
      return {
        removed: payload.removed ?? false,
        cancelledBookings: payload.cancelled_bookings ?? 0,
      };
    } catch (error) {
      rethrow(error);
    }
  },
  async updateSession(sessionId, { room, capacity }) {
    await wait();
    consumeFailure("NETWORK_ERROR");

    try {
      await invokeSchedulingRpc("update_clinic_session", {
        p_session_id: sessionId,
        p_room: room?.trim() || null,
        p_capacity: capacity,
      });
    } catch (error) {
      rethrow(error);
    }
  },
};
