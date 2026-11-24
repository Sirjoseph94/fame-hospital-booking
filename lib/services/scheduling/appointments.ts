// Appointments: booking, rescheduling, cancelling, and doctor visit actions.

import { addMinutes, isBefore, parseISO } from "date-fns";

import { doctorProxyTag } from "@/lib/doctor-agenda-helpers";
import { todayYmdLocal } from "@/lib/scheduling-dates";
import { supabase } from "@/lib/supabase";
import type { AppointmentType, Beneficiary } from "@/types/scheduling";

import { SchedulingError } from "./errors";
import {
  appointmentVisitDateYmd,
  asNetworkError,
  assertCanManageAppointment,
  assertValidHold,
  consumeFailure,
  fetchAppointmentRow,
  getCurrentUserId,
  invokeSlotRpc,
  wait,
} from "./internal";
import { type AppointmentRow, mapAppointment, type SlotRow } from "./mappers";
import type { DoctorAgendaVisitContext, SchedulingService } from "./types";

export const appointmentsMethods: Pick<
  SchedulingService,
  "confirmBooking" | "listAppointments" | "listDoctorAppointments" | "enrichDoctorAgendaVisits" | "confirmDoctorAppointment" | "completeDoctorAppointment" | "rescheduleAppointment" | "cancelAppointment" | "listAppointmentsPage"
> = {
  async confirmBooking(input) {
    await wait();
    consumeFailure("NETWORK_ERROR");

    try {
      const userId = await getCurrentUserId();
      if (userId !== input.accountHolderId) {
        throw new SchedulingError(
          "FORBIDDEN",
          "You can only confirm bookings for your own account.",
        );
      }

      // Client-side pre-check for a fast, specific error; the RPC re-validates
      // everything inside one transaction.
      const { data: holdRow, error: holdError } = await supabase
        .from("slot_holds")
        .select("slot_id, expires_at, held_by")
        .eq("slot_id", input.slotId)
        .maybeSingle();

      if (holdError) {
        asNetworkError(holdError);
      }

      assertValidHold(
        input.slotId,
        input.hold,
        holdRow
          ? {
              slotId: holdRow.slot_id as string,
              expiresAt: holdRow.expires_at as string,
            }
          : null,
        holdRow?.held_by as string | undefined,
        userId,
      );

      const payload = await invokeSlotRpc("book_appointment_from_hold", {
        p_slot_id: input.slotId,
        p_beneficiary_id: input.beneficiaryId,
        p_appointment_type: input.type,
        p_reason: input.reason?.trim() || null,
        p_notes: input.notes?.trim() || null,
        p_address: input.address?.trim() || null,
      });

      if (!payload.appointment_id) {
        throw new SchedulingError(
          "NETWORK_ERROR",
          "The scheduling service could not be reached.",
        );
      }

      return mapAppointment(await fetchAppointmentRow(payload.appointment_id));
    } catch (error) {
      if (error instanceof SchedulingError) {
        throw error;
      }
      asNetworkError(error);
    }
  },
  async listAppointments(accountHolderId) {
    await wait();
    consumeFailure("NETWORK_ERROR");

    try {
      const { data, error } = await supabase
        .from("appointments")
        .select("*, appointment_slots(slot_date, start_time, end_time)")
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
      if (error instanceof SchedulingError) {
        throw error;
      }
      asNetworkError(error);
    }
  },
  async listDoctorAppointments(doctorId, range) {
    await wait();
    consumeFailure("NETWORK_ERROR");

    try {
      let query = supabase
        .from("appointments")
        .select("*, appointment_slots(slot_date, start_time, end_time)")
        .eq("doctor_id", doctorId);
      if (range) {
        query = query
          .gte("appointment_date", range.fromYmd)
          .lte("appointment_date", range.toYmd);
      }
      const { data, error } = await query
        .order("appointment_date", { ascending: true })
        .order("start_time", { ascending: true });

      if (error) {
        asNetworkError(error);
      }

      return ((data ?? []) as AppointmentRow[]).map(mapAppointment);
    } catch (error) {
      if (error instanceof SchedulingError) {
        throw error;
      }
      asNetworkError(error);
    }
  },
  async enrichDoctorAgendaVisits(appointments) {
    await wait();
    consumeFailure("NETWORK_ERROR");

    const context = new Map<string, DoctorAgendaVisitContext>();

    if (appointments.length === 0) {
      return context;
    }

    const holderIds = [
      ...new Set(appointments.map((row) => row.accountHolderId)),
    ];
    const beneficiaryIds = [
      ...new Set(appointments.map((row) => row.beneficiaryId)),
    ];

    try {
      const [{ data: profiles, error: profileError }, { data: beneficiaries, error: benError }] =
        await Promise.all([
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
        const beneficiaryName = beneficiary?.displayName ?? accountHolderName;

        context.set(appointment.id, {
          beneficiaryName,
          accountHolderName,
          relationship,
          proxyTag: doctorProxyTag(accountHolderName, relationship),
        });
      }

      return context;
    } catch (error) {
      if (error instanceof SchedulingError) {
        throw error;
      }
      asNetworkError(error);
    }
  },
  async confirmDoctorAppointment(appointmentId, input) {
    await wait();
    consumeFailure("NETWORK_ERROR");

    try {
      const userId = await getCurrentUserId();
      const appointment = await fetchAppointmentRow(appointmentId);

      if (appointment.doctor_id !== userId) {
        throw new SchedulingError(
          "FORBIDDEN",
          "You can only confirm visits on your schedule.",
        );
      }
      if (appointment.status === "cancelled" || appointment.status === "completed") {
        throw new SchedulingError(
          "INVALID_REQUEST",
          "This appointment can no longer be confirmed.",
        );
      }
      if (appointment.status === "confirmed") {
        return mapAppointment(appointment);
      }

      const visitType = appointment.appointment_type as AppointmentType;
      const room = input?.room?.trim();
      const videoUrl = input?.videoUrl?.trim();

      if (visitType === "in-clinic" && !room) {
        throw new SchedulingError(
          "INVALID_REQUEST",
          "Enter a room before confirming an in-clinic visit.",
        );
      }
      if (visitType === "telehealth" && !videoUrl) {
        throw new SchedulingError(
          "INVALID_REQUEST",
          "Enter a video link before confirming telehealth.",
        );
      }

      const { data: updated, error } = await supabase
        .from("appointments")
        .update({
          status: "confirmed",
          room: visitType === "in-clinic" ? room : appointment.room,
          video_url: visitType === "telehealth" ? videoUrl : appointment.video_url,
        })
        .eq("id", appointmentId)
        .select("*, appointment_slots(slot_date, start_time, end_time)")
        .single();

      if (error || !updated) {
        asNetworkError(error ?? new Error("Confirm failed."));
      }

      return mapAppointment(updated as AppointmentRow);
    } catch (error) {
      if (error instanceof SchedulingError) {
        throw error;
      }
      asNetworkError(error);
    }
  },
  async completeDoctorAppointment(appointmentId) {
    await wait();
    consumeFailure("NETWORK_ERROR");

    try {
      const userId = await getCurrentUserId();
      const appointment = await fetchAppointmentRow(appointmentId);

      if (appointment.doctor_id !== userId) {
        throw new SchedulingError(
          "FORBIDDEN",
          "You can only complete visits on your schedule.",
        );
      }
      if (appointment.status !== "confirmed") {
        throw new SchedulingError(
          "INVALID_REQUEST",
          "Only confirmed visits can be marked complete.",
        );
      }

      const visitDateYmd = appointmentVisitDateYmd(appointment);
      if (visitDateYmd > todayYmdLocal()) {
        throw new SchedulingError(
          "INVALID_REQUEST",
          "This visit is not ready to complete yet.",
        );
      }

      const { data: updated, error } = await supabase
        .from("appointments")
        .update({ status: "completed" })
        .eq("id", appointmentId)
        .select("*, appointment_slots(slot_date, start_time, end_time)")
        .single();

      if (error || !updated) {
        asNetworkError(error ?? new Error("Complete visit failed."));
      }

      return mapAppointment(updated as AppointmentRow);
    } catch (error) {
      if (error instanceof SchedulingError) {
        throw error;
      }
      asNetworkError(error);
    }
  },
  async rescheduleAppointment(appointmentId, newSlotId, hold) {
    await wait();
    consumeFailure("NETWORK_ERROR");

    try {
      const userId = await getCurrentUserId();
      const appointment = await fetchAppointmentRow(appointmentId);
      assertCanManageAppointment(appointment, userId);

      const { data: holdRow } = await supabase
        .from("slot_holds")
        .select("slot_id, expires_at, held_by")
        .eq("slot_id", newSlotId)
        .maybeSingle();

      assertValidHold(
        newSlotId,
        hold,
        holdRow
          ? {
              slotId: holdRow.slot_id as string,
              expiresAt: holdRow.expires_at as string,
            }
          : null,
        holdRow?.held_by as string | undefined,
        userId,
      );

      // Moves the appointment, books the new slot and frees the old one in a
      // single transaction.
      await invokeSlotRpc("reschedule_appointment", {
        p_appointment_id: appointmentId,
        p_new_slot_id: newSlotId,
      });

      return mapAppointment(await fetchAppointmentRow(appointmentId));
    } catch (error) {
      if (error instanceof SchedulingError) {
        throw error;
      }
      asNetworkError(error);
    }
  },
  async cancelAppointment(appointmentId) {
    await wait();
    consumeFailure("NETWORK_ERROR");

    try {
      const userId = await getCurrentUserId();
      assertCanManageAppointment(
        await fetchAppointmentRow(appointmentId),
        userId,
      );

      // Cancels and frees the slot in a single transaction.
      await invokeSlotRpc("cancel_appointment", {
        p_appointment_id: appointmentId,
      });

      return mapAppointment(await fetchAppointmentRow(appointmentId));
    } catch (error) {
      if (error instanceof SchedulingError) {
        throw error;
      }
      asNetworkError(error);
    }
  },
  async listAppointmentsPage({ filter, todayYmd, offset, limit }) {
    await wait();
    consumeFailure("NETWORK_ERROR");

    try {
      let query = supabase
        .from("appointments")
        .select(
          "*, appointment_slots(slot_date, start_time, end_time), doctor:doctors(profile:profiles(full_name))",
        );
      if (filter === "pending" || filter === "confirmed") {
        query = query.eq("status", filter);
      } else if (filter === "today") {
        query = query.eq("appointment_date", todayYmd);
      }

      // Fetch one extra row to know whether another page exists.
      const { data, error } = await query
        .order("appointment_date", { ascending: false })
        .order("start_time", { ascending: false })
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
      if (error instanceof SchedulingError) {
        throw error;
      }
      asNetworkError(error);
    }
  },
};

export function isAppointmentUpcoming(status: string): boolean {
  return status === "pending" || status === "confirmed" || status === "upcoming";
}

export function appointmentEndsAt(row: AppointmentRow, slot?: SlotRow): string {
  if (slot) {
    const endTime =
      slot.end_time.length === 5 ? `${slot.end_time}:00` : slot.end_time;
    return parseISO(`${slot.slot_date}T${endTime}`).toISOString();
  }
  const duration = 30;
  const start =
    row.start_time.length === 5 ? `${row.start_time}:00` : row.start_time;
  return addMinutes(
    parseISO(`${row.appointment_date}T${start}`),
    duration,
  ).toISOString();
}

export function isBeforeNow(iso: string): boolean {
  return isBefore(parseISO(iso), new Date());
}
