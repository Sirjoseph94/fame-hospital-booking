// Doctor directory and per-doctor booking settings.

import { supabase } from "@/lib/supabase";

import { SchedulingError } from "./errors";
import {
  asNetworkError,
  assertCanManageDoctorSchedule,
  consumeFailure,
  getCurrentUserRole,
  wait,
} from "./internal";
import {
  type DoctorRow,
  mapDoctor,
  mapDoctorDetail,
  mapNextOpenSession,
  mapRosterDoctor,
  type NextOpenSessionRow,
} from "./mappers";
import type { NextOpenSession } from "@/types/scheduling";
import type { SchedulingService } from "./types";

/** Earliest bookable session per doctor, from the one-row-per-doctor view. */
async function fetchNextSessionByDoctor(): Promise<Map<string, NextOpenSession>> {
  const { data, error } = await supabase
    .from("doctor_next_open_session")
    .select("doctor_id, session_id, session_date, start_time, end_time, places_left");

  if (error) {
    asNetworkError(error);
  }

  return new Map(
    ((data ?? []) as NextOpenSessionRow[]).map((row) => [
      row.doctor_id,
      mapNextOpenSession(row),
    ]),
  );
}

export const doctorsMethods: Pick<
  SchedulingService,
  | "listDoctors"
  | "getDoctor"
  | "listDoctorsForAdmin"
  | "setDoctorAcceptingBookings"
  | "updateDoctorDetails"
> = {
  async listDoctors() {
    await wait();
    consumeFailure("NETWORK_ERROR");

    try {
      const { data, error } = await supabase
        .from("doctors")
        .select(
          "id, specialty, department, bio, years_experience, is_accepting_bookings, is_active, profile:profiles(full_name)",
        )
        .eq("is_active", true);

      if (error) {
        asNetworkError(error);
      }

      const doctors = (data ?? []) as DoctorRow[];
      const nextByDoctor = await fetchNextSessionByDoctor();

      return doctors.map((row) =>
        mapDoctor(row, nextByDoctor.get(row.id) ?? null),
      );
    } catch (error) {
      if (error instanceof SchedulingError) {
        throw error;
      }
      asNetworkError(error);
    }
  },
  async getDoctor(doctorId) {
    await wait();
    consumeFailure("NETWORK_ERROR");

    try {
      const { data, error } = await supabase
        .from("doctors")
        .select(
          "id, specialty, department, is_accepting_bookings, is_active, profile:profiles(full_name, is_active)",
        )
        .eq("id", doctorId)
        .maybeSingle();

      if (error) {
        asNetworkError(error);
      }
      if (!data) {
        throw new SchedulingError("INVALID_REQUEST", "Doctor not found.");
      }
      return mapDoctorDetail(data as DoctorRow);
    } catch (error) {
      if (error instanceof SchedulingError) {
        throw error;
      }
      asNetworkError(error);
    }
  },
  async listDoctorsForAdmin() {
    await wait();
    consumeFailure("NETWORK_ERROR");

    try {
      const role = await getCurrentUserRole();
      if (role !== "admin") {
        throw new SchedulingError(
          "FORBIDDEN",
          "Only administrators can view the full roster.",
        );
      }

      const { data, error } = await supabase
        .from("doctors")
        .select(
          "id, specialty, department, is_accepting_bookings, is_active, profile:profiles(full_name, is_active)",
        );

      if (error) {
        asNetworkError(error);
      }

      const doctors = (data ?? []) as DoctorRow[];
      const nextByDoctor = await fetchNextSessionByDoctor();

      return doctors.map((row) =>
        mapRosterDoctor(row, nextByDoctor.get(row.id) ?? null),
      );
    } catch (error) {
      if (error instanceof SchedulingError) {
        throw error;
      }
      asNetworkError(error);
    }
  },
  async setDoctorAcceptingBookings(doctorId, isAcceptingBookings) {
    await wait();
    consumeFailure("NETWORK_ERROR");

    try {
      await assertCanManageDoctorSchedule(doctorId);

      const { data, error } = await supabase
        .from("doctors")
        .update({ is_accepting_bookings: isAcceptingBookings })
        .eq("id", doctorId)
        .select(
          "id, specialty, department, is_accepting_bookings, is_active, profile:profiles(full_name, is_active)",
        )
        .single();

      if (error || !data) {
        asNetworkError(error ?? new Error("Could not update booking status."));
      }

      return mapDoctorDetail(data as DoctorRow);
    } catch (error) {
      if (error instanceof SchedulingError) {
        throw error;
      }
      asNetworkError(error);
    }
  },
  async updateDoctorDetails(doctorId, details) {
    await wait();
    consumeFailure("NETWORK_ERROR");

    try {
      const role = await getCurrentUserRole();
      if (role !== "admin") {
        throw new SchedulingError(
          "FORBIDDEN",
          "Only administrators can change a doctor's specialty or department.",
        );
      }
      const specialty = details.specialty.trim();
      const department = details.department.trim();
      if (specialty.length < 2 || department.length < 2) {
        throw new SchedulingError(
          "INVALID_REQUEST",
          "Enter a specialty and a department.",
        );
      }

      const { data, error } = await supabase
        .from("doctors")
        .update({ specialty, department })
        .eq("id", doctorId)
        .select(
          "id, specialty, department, is_accepting_bookings, is_active, profile:profiles(full_name, is_active)",
        )
        .single();

      if (error || !data) {
        asNetworkError(error ?? new Error("Could not update the doctor."));
      }
      return mapDoctorDetail(data as DoctorRow);
    } catch (error) {
      if (error instanceof SchedulingError) {
        throw error;
      }
      asNetworkError(error);
    }
  },
};
