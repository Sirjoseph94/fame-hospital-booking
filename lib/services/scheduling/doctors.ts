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
  mapRosterDoctor,
  type SlotRow,
  slotStartsAt,
} from "./mappers";
import type { SchedulingService } from "./types";

/** Earliest open slot start (ISO) per doctor, from the one-row-per-doctor view. */
async function fetchNextAvailableByDoctor(): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from("doctor_next_available_slots")
    .select("doctor_id, slot_date, start_time");

  if (error) {
    asNetworkError(error);
  }

  return new Map(
    ((data ?? []) as Pick<SlotRow, "doctor_id" | "slot_date" | "start_time">[]).map(
      (row) => [row.doctor_id, slotStartsAt(row)],
    ),
  );
}

export const doctorsMethods: Pick<
  SchedulingService,
  "listDoctors" | "getDoctor" | "listDoctorsForAdmin" | "setDoctorAcceptingBookings"
> = {
  async listDoctors() {
    await wait();
    consumeFailure("NETWORK_ERROR");

    try {
      const { data, error } = await supabase
        .from("doctors")
        .select(
          "id, specialty, department, is_accepting_bookings, is_active, profile:profiles(full_name)",
        )
        .eq("is_active", true);

      if (error) {
        asNetworkError(error);
      }

      const doctors = (data ?? []) as DoctorRow[];
      const nextByDoctor = await fetchNextAvailableByDoctor();

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
      const nextByDoctor = await fetchNextAvailableByDoctor();

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
};
