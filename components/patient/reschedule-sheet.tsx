import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { format, parseISO } from "date-fns";

import { RefreshErrorNotice } from "@/components/ui/refresh-error-notice";
import { SchedulingStatePanel } from "@/components/ui/scheduling-state-panel";
import { Sheet } from "@/components/ui/sheet";
import { SlotChip } from "@/components/ui/slot-chip";
import { SlotGridSkeleton } from "@/components/ui/skeleton";
import { useRescheduleAppointment } from "@/lib/queries/appointments";
import { useBookableSlots } from "@/lib/queries/slots";
import { groupSlotsByDate } from "@/lib/slot-groups";
import {
  SchedulingError,
  schedulingService,
} from "@/lib/services/scheduling";

interface RescheduleSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  doctorId: string;
  doctorName: string;
  currentSlotId: string;
  onRescheduled: () => void;
  appointmentId: string;
}

function slotsErrorMessage(cause: unknown): string {
  return cause instanceof SchedulingError
    ? cause.message
    : "Could not load alternative times.";
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
  // Only fetch while the sheet is open; bookable slots are always refetched
  // when the query (re)activates, since availability is contended.
  const slotsQuery = useBookableSlots(open ? doctorId : undefined);
  const rescheduleAppointment = useRescheduleAppointment();
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionErrorCode, setActionErrorCode] = useState<
    SchedulingError["code"] | null
  >(null);

  const slotRows = slotsQuery.data;
  const slots = useMemo(
    () =>
      (slotRows ?? []).filter(
        (slot) => slot.status === "available" && slot.id !== currentSlotId,
      ),
    [currentSlotId, slotRows],
  );
  const sections = useMemo(() => groupSlotsByDate(slots), [slots]);

  const initialLoading = slotRows === undefined && slotsQuery.isPending;
  const blockingError =
    slotsQuery.isError && slotRows === undefined ? slotsQuery.error : null;
  const refreshError = slotsQuery.isError ? slotsQuery.error : null;

  useEffect(() => {
    if (open) {
      return;
    }
    const resetTask = setTimeout(() => {
      setSelectedSlotId(null);
      setActionError(null);
    }, 0);
    return () => clearTimeout(resetTask);
  }, [open]);

  const confirmReschedule = async () => {
    if (!selectedSlotId) {
      return;
    }
    setSubmitting(true);
    setActionError(null);
    setActionErrorCode(null);
    let heldSlotId: string | null = null;
    let reachedReschedule = false;
    try {
      const hold = await schedulingService.holdSlot(selectedSlotId);
      heldSlotId = selectedSlotId;
      reachedReschedule = true;
      await rescheduleAppointment.mutateAsync({
        appointmentId,
        newSlotId: selectedSlotId,
        hold,
      });
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
        // A failed reschedule already invalidated the slot cache; a failed
        // hold didn't, so refetch the alternatives here.
        if (!reachedReschedule) {
          await slotsQuery.refetch();
        }
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

      {!blockingError ? (
        <RefreshErrorNotice
          message={refreshError ? slotsErrorMessage(refreshError) : null}
        />
      ) : null}

      {initialLoading ? (
        <SlotGridSkeleton />
      ) : blockingError ? (
        <SchedulingStatePanel
          compact
          message={slotsErrorMessage(blockingError)}
          onRetry={() => void slotsQuery.refetch()}
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
