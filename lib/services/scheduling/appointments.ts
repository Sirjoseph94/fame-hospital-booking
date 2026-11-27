// Appointments: booking into sessions, moving, cancelling, and doctor actions.

import { parseISO } from "date-fns";

import { doctorProxyTag } from "@/lib/doctor-agenda-helpers";
import { supabase } from "@/lib/supabase";
import type { Beneficiary } from "@/types/scheduling";

import { SchedulingError } from "./errors";
import {
  APPOINTMENT_SELECT,
  asNetworkError,
  assertCanManageAppointment,
  consumeFailure,
  fetchAppointmentRow,
  getCurrentUserId,
  invokeSchedulingRpc,
  wait,
} from "./internal";
import { type AppointmentRow, mapAppointment } from "./mappers";
import type { DoctorAgendaVisitContext, SchedulingService } from "./types";

function rethrow(error: unknown): never {
  if (error instanceof SchedulingError) {
    throw error;
  }
  asNetworkError(error);
}

export const appointmentsMethods: Pick<
  SchedulingService,
  | "bookSession"
  | "moveBooking"
  | "listAppointments"
  | "listDoctorAppointments"
  | "enrichDoctorAgendaVisits"
  | "completeDoctorAppointment"
  | "cancelAppointment"
  | "listAppointmentsPage"
> = {
  async bookSession(input) {
    await wait();
    consumeFailure("NETWORK_ERROR");

    try {
      const userId = await getCurrentUserId();
      if (userId !== input.accountHolderId) {
        throw new SchedulingError(
          "FORBIDDEN",
          "You can only book for your own account.",
        );
      }

      // Capacity, duplicates and doctor availability are checked in one
      // transaction under a lock on the session.
      const payload = await invokeSchedulingRpc("book_session", {
        p_session_id: input.sessionId,
        p_beneficiary_id: input.beneficiaryId,
        p_reason: input.reason?.trim() || null,
        p_notes: input.notes?.trim() || null,
      });

      if (!payload.appointment_id) {
        throw new SchedulingError(
          "NETWORK_ERROR",
          "The scheduling service could not be reached.",
        );
      }
      return mapAppointment(await fetchAppointmentRow(payload.appointment_id));
    } catch (error) {
      rethrow(error);
    }
  },
  async moveBooking(appointmentId, newSessionId) {
    await wait();
    consumeFailure("NETWORK_ERROR");

    try {
      const userId = await getCurrentUserId();
      assertCanManageAppointment(await fetchAppointmentRow(appointmentId), userId);

      await invokeSchedulingRpc("move_session_booking", {
        p_appointment_id: appointmentId,
        p_new_session_id: newSessionId,
      });
      return mapAppointment(await fetchAppointmentRow(appointmentId));
    } catch (error) {
      rethrow(error);
    }
  },
  async listAppointments(accountHolderId) {
    await wait();
    consumeFailure("NETWORK_ERROR");

    try {
      const { data, error } = await supabase
        .from("appointments")
        .select(APPOINTMENT_SELECT)
        .or(
          `account_holder_id.eq.${accountHolderId},patient_id.eq.${accountHolderId}`,
        )
        .order("appointment_date", { ascending: true })
        .order("start_time", { ascending: true });

      if (error) {
        asNetworkError(error);
      }
      return ((data ?? []) as AppointmentRow[]).map(mapAppointment);
    } catch (error) {
      rethrow(error);
    }
  },
  async listDoctorAppointments(doctorId, range) {
    await wait();
    consumeFailure("NETWORK_ERROR");

    try {
      let query = supabase
        .from("appointments")
        .select(APPOINTMENT_SELECT)
        .eq("doctor_id", doctorId);
      if (range) {
        query = query
          .gte("appointment_date", range.fromYmd)
          .lte("appointment_date", range.toYmd);
      }
      const { data, error } = await query
        .order("appointment_date", { ascending: true })
        .order("start_time", { ascending: true })
        .order("created_at", { ascending: true });

      if (error) {
        asNetworkError(error);
      }
      return ((data ?? []) as AppointmentRow[]).map(mapAppointment);
    } catch (error) {
      rethrow(error);
    }
  },
  async enrichDoctorAgendaVisits(appointments) {
    await wait();
    consumeFailure("NETWORK_ERROR");

    const context = new Map<string, DoctorAgendaVisitContext>();
    if (appointments.length === 0) {
      return context;
    }

    const holderIds = [...new Set(appointments.map((row) => row.accountHolderId))];
    const beneficiaryIds = [...new Set(appointments.map((row) => row.beneficiaryId))];

    try {
      const [
        { data: profiles, error: profileError },
        { data: beneficiaries, error: benError },
      ] = await Promise.all([
        supabase.from("profiles").select("id, full_name").in("id", holderIds),
        supabase
          .from("beneficiaries")
          .select("id, display_name, relationship")
          .in("id", beneficiaryIds),
      ]);

      if (profileError) {
        asNetworkError(profileError);
      }
      if (benError) {
        asNetworkError(benError);
      }

      const holderNameById = new Map(
        (profiles ?? []).map((row) => [row.id as string, row.full_name as string]),
      );
      const beneficiaryById = new Map(
        (beneficiaries ?? []).map((row) => [
          row.id as string,
          {
            displayName: row.display_name as string,
            relationship: row.relationship as Beneficiary["relationship"],
          },
        ]),
      );

      for (const appointment of appointments) {
        const beneficiary = beneficiaryById.get(appointment.beneficiaryId);
        const accountHolderName =
          holderNameById.get(appointment.accountHolderId) ?? "Account holder";
        const relationship = beneficiary?.relationship ?? "self";

        context.set(appointment.id, {
          beneficiaryName: beneficiary?.displayName ?? accountHolderName,
          accountHolderName,
          relationship,
          proxyTag: doctorProxyTag(accountHolderName, relationship),
        });
      }
      return context;
    } catch (error) {
      rethrow(error);
    }
  },
  async completeDoctorAppointment(appointmentId) {
    await wait();
    consumeFailure("NETWORK_ERROR");

    try {
      const userId = await getCurrentUserId();
      const row = await fetchAppointmentRow(appointmentId);

      if (row.doctor_id !== userId) {
        throw new SchedulingError(
          "FORBIDDEN",
          "You can only complete visits on your schedule.",
        );
      }
      if (row.status !== "confirmed") {
        throw new SchedulingError(
          "INVALID_REQUEST",
          "Only booked visits can be marked complete.",
        );
      }
      const startsAt = mapAppointment(row).startsAt;
      if (!startsAt || parseISO(startsAt).getTime() > Date.now()) {
        throw new SchedulingError(
          "INVALID_REQUEST",
          "This visit can be completed once its session has started.",
        );
      }

      const { data: updated, error } = await supabase
        .from("appointments")
        .update({ status: "completed" })
        .eq("id", appointmentId)
        .select(APPOINTMENT_SELECT)
        .single();

      if (error || !updated) {
        asNetworkError(error ?? new Error("Complete visit failed."));
      }
      return mapAppointment(updated as AppointmentRow);
    } catch (error) {
      rethrow(error);
    }
  },
  async cancelAppointment(appointmentId) {
    await wait();
    consumeFailure("NETWORK_ERROR");

    try {
      const userId = await getCurrentUserId();
      assertCanManageAppointment(await fetchAppointmentRow(appointmentId), userId);

      // Frees the place in the session (capacity is a live count).
      await invokeSchedulingRpc("cancel_appointment", {
        p_appointment_id: appointmentId,
      });
      return mapAppointment(await fetchAppointmentRow(appointmentId));
    } catch (error) {
      rethrow(error);
    }
  },
  async listAppointmentsPage({ filter, todayYmd, offset, limit }) {
    await wait();
    consumeFailure("NETWORK_ERROR");

    try {
      let query = supabase
        .from("appointments")
        .select(`${APPOINTMENT_SELECT}, doctor:doctors(profile:profiles(full_name))`);
      if (filter === "today") {
        query = query.eq("appointment_date", todayYmd);
      } else if (filter === "upcoming") {
        query = query
          .gte("appointment_date", todayYmd)
          .in("status", ["pending", "confirmed"]);
      } else if (filter === "cancelled") {
        query = query.eq("status", "cancelled");
      }

      // Fetch one extra row to know whether another page exists.
      const { data, error } = await query
        .order("appointment_date", { ascending: filter === "upcoming" })
        .order("start_time", { ascending: filter === "upcoming" })
        .range(offset, offset + limit);

      if (error) {
        asNetworkError(error);
      }

      type Row = AppointmentRow & {
        doctor?: { profile?: { full_name?: string } | { full_name?: string }[] | null } | null;
      };
      const rows = (data ?? []) as Row[];
      const items = rows.slice(0, limit).map((row) => {
        const profile = row.doctor?.profile;
        const fullName = Array.isArray(profile)
          ? profile[0]?.full_name
          : profile?.full_name;
        return { ...mapAppointment(row), doctorName: fullName?.trim() || "Doctor" };
      });
      return { items, hasMore: rows.length > limit };
    } catch (error) {
      rethrow(error);
    }
  },
};
