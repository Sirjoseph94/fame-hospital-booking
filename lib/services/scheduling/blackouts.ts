// Blackout windows that block a doctor's slots.

import { parseISO } from "date-fns";

import { assertScheduleInstantNotInPast } from "@/lib/scheduling-dates";
import { supabase } from "@/lib/supabase";

import { SchedulingError } from "./errors";
import {
  asNetworkError,
  assertCanManageDoctorSchedule,
  consumeFailure,
  wait,
} from "./internal";
import {
  type BlackoutRow,
  mapBlackout,
  slotDurationMin,
  type SlotRow,
  slotStartsAt,
} from "./mappers";
import type { SchedulingService } from "./types";

export const blackoutsMethods: Pick<
  SchedulingService,
  "setBlackout" | "listBlackouts" | "deleteBlackout"
> = {
  async setBlackout(input) {
    await wait();
    consumeFailure("NETWORK_ERROR");

    try {
      try {
        assertScheduleInstantNotInPast(input.startsAt);
      } catch (cause) {
        throw new SchedulingError(
          "INVALID_REQUEST",
          cause instanceof Error
            ? cause.message
            : "Cannot schedule in the past.",
        );
      }

      const { data: blackoutRow, error } = await supabase
        .from("blackout_rules")
        .insert({
          doctor_id: input.doctorId,
          starts_at: input.startsAt,
          ends_at: input.endsAt,
          reason: input.reason,
          set_by: input.setBy,
        })
        .select("*")
        .single();

      if (error || !blackoutRow) {
        asNetworkError(error ?? new Error("Blackout could not be saved."));
      }

      const startsAt = parseISO(input.startsAt).getTime();
      const endsAt = parseISO(input.endsAt).getTime();

      const { data: slots, error: slotError } = await supabase
        .from("appointment_slots")
        .select("*")
        .eq("doctor_id", input.doctorId);

      if (slotError) {
        asNetworkError(slotError);
      }

      const overlapping = ((slots ?? []) as SlotRow[]).filter((slot) => {
        const slotStart = parseISO(slotStartsAt(slot)).getTime();
        const slotEnd = slotStart + slotDurationMin(slot) * 60_000;
        return slotStart < endsAt && slotEnd > startsAt;
      });

      if (overlapping.length > 0) {
        await supabase
          .from("appointment_slots")
          .update({ status: "blackout" })
          .in(
            "id",
            overlapping.map((slot) => slot.id),
          );
      }

      return mapBlackout(blackoutRow as BlackoutRow);
    } catch (error) {
      if (error instanceof SchedulingError) {
        throw error;
      }
      asNetworkError(error);
    }
  },
  async listBlackouts(doctorId) {
    await wait();
    consumeFailure("NETWORK_ERROR");

    try {
      const { data, error } = await supabase
        .from("blackout_rules")
        .select("*")
        .eq("doctor_id", doctorId)
        .order("starts_at", { ascending: true });

      if (error) {
        asNetworkError(error);
      }

      return ((data ?? []) as BlackoutRow[]).map(mapBlackout);
    } catch (error) {
      if (error instanceof SchedulingError) {
        throw error;
      }
      asNetworkError(error);
    }
  },
  async deleteBlackout(blackoutId) {
    await wait();
    consumeFailure("NETWORK_ERROR");

    try {
      const { data: blackoutRow, error: fetchError } = await supabase
        .from("blackout_rules")
        .select("*")
        .eq("id", blackoutId)
        .maybeSingle();

      if (fetchError) {
        asNetworkError(fetchError);
      }
      if (!blackoutRow) {
        throw new SchedulingError("NETWORK_ERROR", "Blackout not found.");
      }

      const rule = mapBlackout(blackoutRow as BlackoutRow);
      await assertCanManageDoctorSchedule(rule.doctorId);

      if (parseISO(rule.endsAt).getTime() <= Date.now()) {
        throw new SchedulingError(
          "INVALID_REQUEST",
          "Past blackouts cannot be removed.",
        );
      }

      const { error: deleteError } = await supabase
        .from("blackout_rules")
        .delete()
        .eq("id", blackoutId);

      if (deleteError) {
        asNetworkError(deleteError);
      }

      const removedStart = parseISO(rule.startsAt).getTime();
      const removedEnd = parseISO(rule.endsAt).getTime();

      const [{ data: remainingRows, error: remainingError }, { data: slots, error: slotError }] =
        await Promise.all([
          supabase
            .from("blackout_rules")
            .select("*")
            .eq("doctor_id", rule.doctorId),
          supabase
            .from("appointment_slots")
            .select("*")
            .eq("doctor_id", rule.doctorId),
        ]);

      if (remainingError || slotError) {
        asNetworkError(remainingError ?? slotError);
      }

      const remaining = ((remainingRows ?? []) as BlackoutRow[]).map(mapBlackout);

      const overlapsWindow = (
        slotStartMs: number,
        slotEndMs: number,
        startMs: number,
        endMs: number,
      ) => slotStartMs < endMs && slotEndMs > startMs;

      const stillBlackedOut = (slotStartMs: number, slotEndMs: number) =>
        remaining.some((other) =>
          overlapsWindow(
            slotStartMs,
            slotEndMs,
            parseISO(other.startsAt).getTime(),
            parseISO(other.endsAt).getTime(),
          ),
        );

      const toRelease = ((slots ?? []) as SlotRow[]).filter((slot) => {
        if (slot.status !== "blackout") {
          return false;
        }
        const slotStart = parseISO(slotStartsAt(slot)).getTime();
        const slotEnd = slotStart + slotDurationMin(slot) * 60_000;
        if (!overlapsWindow(slotStart, slotEnd, removedStart, removedEnd)) {
          return false;
        }
        return !stillBlackedOut(slotStart, slotEnd);
      });

      if (toRelease.length > 0) {
        await supabase
          .from("appointment_slots")
          .update({ status: "available" })
          .in(
            "id",
            toRelease.map((slot) => slot.id),
          );
      }
    } catch (error) {
      if (error instanceof SchedulingError) {
        throw error;
      }
      asNetworkError(error);
    }
  },
};
