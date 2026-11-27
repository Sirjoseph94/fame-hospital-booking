// Appointment slots: listing, holds, and doctor/admin availability management.

import { parseISO } from "date-fns";

import { holdDurationSeconds } from "@/lib/scheduling-constants";
import {
  assertScheduleDateNotInPast,
  assertScheduleInstantNotInPast,
  todayYmdLocal,
} from "@/lib/scheduling-dates";
import { supabase } from "@/lib/supabase";
import type { Slot, SlotHold } from "@/types/scheduling";

import { SchedulingError } from "./errors";
import {
  asNetworkError,
  assertCanManageDoctorSchedule,
  assertValidHold,
  bookedEndsByDoctor,
  bookedEndsForDoctor,
  cleanupExpiredHolds,
  consumeFailure,
  fetchBufferMinutes,
  getCurrentUserId,
  invokeSlotRpc,
  normalizeTimeForDb,
  previousYmd,
  wait,
} from "./internal";
import { applyBufferToSlots, mapSlot, type SlotRow } from "./mappers";
import type { SchedulingService } from "./types";

export const slotsMethods: Pick<
  SchedulingService,
  "listSlots" | "holdSlot" | "releaseHold" | "syncBookingHold" | "listSlotsOnDate" | "listScheduleSlotsOnDate" | "createAvailabilitySlot" | "removeAvailabilitySlot"
  | "listSlotsOnDateForDoctors"
> = {
  async listSlots(doctorId) {
    await wait();
    consumeFailure("NETWORK_ERROR");

    try {
      await cleanupExpiredHolds();

      const { data, error } = await supabase
        .from("appointment_slots")
        .select("*")
        .eq("doctor_id", doctorId)
        .gte("slot_date", todayYmdLocal())
        .order("slot_date", { ascending: true })
        .order("start_time", { ascending: true });

      if (error) {
        asNetworkError(error);
      }

      const bufferMinutes = await fetchBufferMinutes();
      const bookedEnds = await bookedEndsForDoctor(
        doctorId,
        previousYmd(todayYmdLocal()),
      );
      const nowMs = Date.now();
      const slots = ((data ?? []) as SlotRow[])
        .map(mapSlot)
        .filter((slot) => parseISO(slot.startsAt).getTime() >= nowMs);
      return applyBufferToSlots(slots, bookedEnds, bufferMinutes);
    } catch (error) {
      if (error instanceof SchedulingError) {
        throw error;
      }
      asNetworkError(error);
    }
  },
  async holdSlot(slotId) {
    await wait();
    consumeFailure("NETWORK_ERROR");
    consumeFailure("SLOT_TAKEN");

    try {
      await getCurrentUserId();
      const payload = await invokeSlotRpc("hold_slot_if_available", {
        p_slot_id: slotId,
        p_ttl_seconds: holdDurationSeconds,
      });
      const expiresAt = payload.expires_at;
      if (!expiresAt) {
        throw new SchedulingError(
          "NETWORK_ERROR",
          "The scheduling service could not be reached.",
        );
      }
      return { slotId, expiresAt };
    } catch (error) {
      if (error instanceof SchedulingError) {
        throw error;
      }
      asNetworkError(error);
    }
  },
  async releaseHold(slotId) {
    await wait();
    consumeFailure("NETWORK_ERROR");

    try {
      await getCurrentUserId();
      try {
        await invokeSlotRpc("release_slot_hold", { p_slot_id: slotId });
      } catch {
        // Best-effort (sign-out / abandon flows).
      }
    } catch (error) {
      if (error instanceof SchedulingError) {
        throw error;
      }
      asNetworkError(error);
    }
  },
  async syncBookingHold(slotId, hold) {
    await wait();
    consumeFailure("NETWORK_ERROR");

    try {
      const userId = await getCurrentUserId();
      await cleanupExpiredHolds();

      const { data: holdRow, error: holdError } = await supabase
        .from("slot_holds")
        .select("slot_id, expires_at, held_by")
        .eq("slot_id", slotId)
        .maybeSingle();

      if (holdError) {
        asNetworkError(holdError);
      }

      const activeHold: SlotHold | null = holdRow
        ? {
            slotId: holdRow.slot_id as string,
            expiresAt: holdRow.expires_at as string,
          }
        : null;

      assertValidHold(
        slotId,
        hold,
        activeHold,
        holdRow?.held_by as string | undefined,
        userId,
      );

      return {
        slotId,
        expiresAt: activeHold!.expiresAt,
      };
    } catch (error) {
      if (error instanceof SchedulingError) {
        throw error;
      }
      asNetworkError(error);
    }
  },
  async listSlotsOnDate(doctorId, dateYmd) {
    await wait();
    consumeFailure("NETWORK_ERROR");

    try {
      await cleanupExpiredHolds();

      const { data, error } = await supabase
        .from("appointment_slots")
        .select("*")
        .eq("doctor_id", doctorId)
        .eq("slot_date", dateYmd)
        .order("start_time", { ascending: true });

      if (error) {
        asNetworkError(error);
      }

      const bufferMinutes = await fetchBufferMinutes();
      const bookedEnds = await bookedEndsForDoctor(
        doctorId,
        previousYmd(dateYmd),
        dateYmd,
      );
      const slots = ((data ?? []) as SlotRow[]).map(mapSlot);
      return applyBufferToSlots(slots, bookedEnds, bufferMinutes);
    } catch (error) {
      if (error instanceof SchedulingError) {
        throw error;
      }
      asNetworkError(error);
    }
  },
  async listSlotsOnDateForDoctors(doctorIds, dateYmd) {
    await wait();
    consumeFailure("NETWORK_ERROR");

    try {
      const byDoctor = new Map<string, Slot[]>(
        doctorIds.map((id) => [id, []]),
      );
      if (doctorIds.length === 0) {
        return byDoctor;
      }

      await cleanupExpiredHolds();

      const [{ data, error }, bufferMinutes, bookedEnds] = await Promise.all([
        supabase
          .from("appointment_slots")
          .select("*")
          .in("doctor_id", doctorIds)
          .eq("slot_date", dateYmd)
          .order("start_time", { ascending: true }),
        fetchBufferMinutes(),
        bookedEndsByDoctor(doctorIds, previousYmd(dateYmd), dateYmd),
      ]);

      if (error) {
        asNetworkError(error);
      }

      ((data ?? []) as SlotRow[]).forEach((row) => {
        byDoctor.get(row.doctor_id)?.push(mapSlot(row));
      });
      byDoctor.forEach((slots, doctorId) => {
        byDoctor.set(
          doctorId,
          applyBufferToSlots(slots, bookedEnds.get(doctorId) ?? [], bufferMinutes),
        );
      });
      return byDoctor;
    } catch (error) {
      if (error instanceof SchedulingError) {
        throw error;
      }
      asNetworkError(error);
    }
  },
  async listScheduleSlotsOnDate(doctorId, dateYmd) {
    await wait();
    consumeFailure("NETWORK_ERROR");

    try {
      await assertCanManageDoctorSchedule(doctorId);
      await cleanupExpiredHolds();

      const { data, error } = await supabase
        .from("appointment_slots")
        .select("*")
        .eq("doctor_id", doctorId)
        .eq("slot_date", dateYmd)
        .order("start_time", { ascending: true });

      if (error) {
        asNetworkError(error);
      }

      return ((data ?? []) as SlotRow[]).map(mapSlot);
    } catch (error) {
      if (error instanceof SchedulingError) {
        throw error;
      }
      asNetworkError(error);
    }
  },
  async createAvailabilitySlot(input) {
    await wait();
    consumeFailure("NETWORK_ERROR");

    try {
      await assertCanManageDoctorSchedule(input.doctorId);

      const startTime = normalizeTimeForDb(input.startTime);
      const endTime = normalizeTimeForDb(input.endTime);

      try {
        assertScheduleDateNotInPast(input.slotDate);
        assertScheduleInstantNotInPast(parseISO(`${input.slotDate}T${startTime}`));
      } catch (cause) {
        throw new SchedulingError(
          "INVALID_REQUEST",
          cause instanceof Error
            ? cause.message
            : "Cannot schedule in the past.",
        );
      }

      const { data, error } = await supabase
        .from("appointment_slots")
        .insert({
          doctor_id: input.doctorId,
          slot_date: input.slotDate,
          start_time: startTime,
          end_time: endTime,
          status: "available",
        })
        .select("*")
        .single();

      if (error) {
        if (error.code === "23505") {
          throw new SchedulingError(
            "SLOT_TAKEN",
            "An open slot already exists at that start time.",
          );
        }
        asNetworkError(error);
      }
      if (!data) {
        asNetworkError(new Error("Slot could not be created."));
      }

      return mapSlot(data as SlotRow);
    } catch (error) {
      if (error instanceof SchedulingError) {
        throw error;
      }
      asNetworkError(error);
    }
  },
  async removeAvailabilitySlot(slotId) {
    await wait();
    consumeFailure("NETWORK_ERROR");

    try {
      const { data: slot, error: readError } = await supabase
        .from("appointment_slots")
        .select("*")
        .eq("id", slotId)
        .maybeSingle();

      if (readError) {
        asNetworkError(readError);
      }
      if (!slot) {
        throw new SchedulingError("NETWORK_ERROR", "Slot not found.");
      }

      const slotRow = slot as SlotRow;
      await assertCanManageDoctorSchedule(slotRow.doctor_id);

      if (slotRow.status === "booked" || slotRow.status === "held") {
        throw new SchedulingError(
          "INVALID_REQUEST",
          "Booked or held slots cannot be removed. Cancel the appointment first.",
        );
      }

      // A slot can carry a live visit without being 'booked' (older blackouts
      // overwrote booked slots). Deleting it would leave the visit with no slot.
      const { count: activeVisits, error: visitError } = await supabase
        .from("appointments")
        .select("id", { count: "exact", head: true })
        .eq("slot_id", slotId)
        .in("status", ["pending", "confirmed"]);

      if (visitError) {
        asNetworkError(visitError);
      }
      if ((activeVisits ?? 0) > 0) {
        throw new SchedulingError(
          "INVALID_REQUEST",
          "This slot has a booked visit. Cancel or reschedule the visit first.",
        );
      }

      const { error: deleteError } = await supabase
        .from("appointment_slots")
        .delete()
        .eq("id", slotId);

      if (deleteError) {
        asNetworkError(deleteError);
      }
    } catch (error) {
      if (error instanceof SchedulingError) {
        throw error;
      }
      asNetworkError(error);
    }
  },
};
