import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { format, parseISO } from "date-fns";

import { SchedulingStatePanel } from "@/components/ui/scheduling-state-panel";
import { Sheet } from "@/components/ui/sheet";
import { SlotChip } from "@/components/ui/slot-chip";
import { SlotGridSkeleton } from "@/components/ui/skeleton";
import { groupSlotsByDate } from "@/lib/slot-groups";
import {
  SchedulingError,
  schedulingService,
} from "@/lib/services/scheduling";
import type { Slot } from "@/types/scheduling";

interface RescheduleSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  doctorId: string;
  doctorName: string;
  currentSlotId: string;
  onRescheduled: () => void;
  appointmentId: string;
}

export function RescheduleSheet({
  open,
  onOpenChange,
  doctorId,
  doctorName,
  currentSlotId,
  onRescheduled,
  appointmentId,
}: RescheduleSheetProps) {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionErrorCode, setActionErrorCode] = useState<
    SchedulingError["code"] | null
  >(null);

  const sections = useMemo(() => groupSlotsByDate(slots), [slots]);

  const loadAlternatives = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await schedulingService.listSlots(doctorId);
      setSlots(
        rows.filter(
          (slot) =>
            slot.status === "available" && slot.id !== currentSlotId,
        ),
      );
    } catch (cause) {
      setError(
        cause instanceof SchedulingError
          ? cause.message
          : "Could not load alternative times.",
      );
    } finally {
      setLoading(false);
    }
  }, [currentSlotId, doctorId]);

  useEffect(() => {
    if (!open) {
      const resetTask = setTimeout(() => {
        setSelectedSlotId(null);
        setActionError(null);
      }, 0);
      return () => clearTimeout(resetTask);
    }
    const task = setTimeout(() => void loadAlternatives(), 0);
    return () => clearTimeout(task);
  }, [loadAlternatives, open]);

  const confirmReschedule = async () => {
    if (!selectedSlotId) {
      return;
    }
    setSubmitting(true);
    setActionError(null);
    setActionErrorCode(null);
    let heldSlotId: string | null = null;
    try {
      const hold = await schedulingService.holdSlot(selectedSlotId);
      heldSlotId = selectedSlotId;
      await schedulingService.rescheduleAppointment(
        appointmentId,
        selectedSlotId,
        hold,
      );
      heldSlotId = null;
      onRescheduled();
      onOpenChange(false);
    } catch (cause) {
      if (heldSlotId) {
        // Don't leave the replacement slot locked for 5 minutes after a failure.
        try {
          await schedulingService.releaseHold(heldSlotId);
        } catch {
          // Best-effort; the hold expires on its own.
        }
      }
      const message =
        cause instanceof SchedulingError
          ? cause.message
          : "Reschedule failed. Try another slot.";
      setActionError(message);
      setActionErrorCode(cause instanceof SchedulingError ? cause.code : null);
      if (
        cause instanceof SchedulingError &&
        (cause.code === "SLOT_TAKEN" || cause.code === "HOLD_EXPIRED")
      ) {
        setSelectedSlotId(null);
        await loadAlternatives();
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={`Reschedule · ${doctorName}`}
      accessibilityLabel="Reschedule appointment"
    >
      <Text className="text-sm text-ink-muted">
        Pick a new time, then confirm — two taps to move your visit.
      </Text>

      {loading ? (
        <SlotGridSkeleton />
      ) : error ? (
        <SchedulingStatePanel
          compact
          message={error}
          onRetry={() => void loadAlternatives()}
        />
      ) : slots.length === 0 ? (
        <Text className="text-sm text-ink-muted">
          No alternative slots are open for this doctor right now.
        </Text>
      ) : (
        <ScrollView className="max-h-72" nestedScrollEnabled>
          <View className="gap-3">
            {sections.map((section) => (
              <View key={section.dateKey} className="gap-2">
                <Text className="text-sm font-semibold text-ink">
                  {section.title}
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {section.slots.map((slot) => (
                    <SlotChip
                      key={slot.id}
                      label={format(parseISO(slot.startsAt), "h:mm a")}
                      variant={selectedSlotId === slot.id ? "selected" : "available"}
                      onPress={() => setSelectedSlotId(slot.id)}
                    />
                  ))}
                </View>
              </View>
            ))}
          </View>
        </ScrollView>
      )}

      {actionError ? (
        <SchedulingStatePanel
          compact
          code={actionErrorCode ?? undefined}
          message={actionError}
          onRepick={() => {
            setActionError(null);
            setActionErrorCode(null);
            setSelectedSlotId(null);
          }}
          onRetry={
            actionErrorCode === "NETWORK_ERROR"
              ? () => void confirmReschedule()
              : undefined
          }
        />
      ) : null}

      <Pressable
        accessibilityLabel="Confirm new appointment time"
        accessibilityRole="button"
        accessibilityState={{
          disabled: !selectedSlotId || submitting,
          busy: submitting,
        }}
        className="min-h-12 items-center justify-center rounded-xl bg-primary px-4 web:hover:opacity-90"
        disabled={!selectedSlotId || submitting}
        onPress={() => void confirmReschedule()}
      >
        <Text className="text-base font-semibold text-surface">
          {submitting ? "Updating…" : "Confirm new time"}
        </Text>
      </Pressable>
    </Sheet>
  );
}
