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

      // Never touch booked slots: that would hide a live visit behind a
      // "Blocked" slot (which could then be deleted, orphaning the visit).
      // Held slots are safe to block — booking requires status 'held', so the
      // patient's checkout fails cleanly, and hold release only resets 'held'.
      const toBlock = overlapping.filter(
        (slot) => slot.status === "available" || slot.status === "held",
      );
      const bookedVisitsInWindow = overlapping.filter(
        (slot) => slot.status === "booked",
      ).length;

      if (toBlock.length > 0) {
        const { error: blockError } = await supabase
          .from("appointment_slots")
          .update({ status: "blackout" })
          .in(
            "id",
            toBlock.map((slot) => slot.id),
          );
        if (blockError) {
          asNetworkError(blockError);
        }
      }

      return {
        rule: mapBlackout(blackoutRow as BlackoutRow),
        bookedVisitsInWindow,
      };
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
        // Older versions blacked out booked slots too. Put those back to
        // 'booked' instead of opening them up for a second booking.
        const { data: activeRows, error: activeError } = await supabase
          .from("appointments")
          .select("slot_id")
          .in(
            "slot_id",
            toRelease.map((slot) => slot.id),
          )
          .in("status", ["pending", "confirmed"]);

        if (activeError) {
          asNetworkError(activeError);
        }

        const inUse = new Set(
          ((activeRows ?? []) as { slot_id: string | null }[]).map(
            (row) => row.slot_id,
          ),
        );
        const reopen = toRelease.filter((slot) => !inUse.has(slot.id));
        const rebook = toRelease.filter((slot) => inUse.has(slot.id));

        const updates = [
          reopen.length > 0
            ? supabase
                .from("appointment_slots")
                .update({ status: "available" })
                .in(
                  "id",
                  reopen.map((slot) => slot.id),
                )
            : null,
          rebook.length > 0
            ? supabase
                .from("appointment_slots")
                .update({ status: "booked" })
                .in(
                  "id",
                  rebook.map((slot) => slot.id),
                )
            : null,
        ];
        for (const result of await Promise.all(updates)) {
          if (result?.error) {
            asNetworkError(result.error);
          }
        }
      }
    } catch (error) {
      if (error instanceof SchedulingError) {
        throw error;
      }
      asNetworkError(error);
    }
  },
};
