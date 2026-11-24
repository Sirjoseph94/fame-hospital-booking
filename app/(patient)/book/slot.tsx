import { useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  ScrollView,
  Text,
  View,
} from "react-native";
import { Stack, router } from "expo-router";
import { format, parseISO } from "date-fns";

import { RefreshErrorNotice } from "@/components/ui/refresh-error-notice";
import { SlotChip } from "@/components/ui/slot-chip";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SchedulingStatePanel } from "@/components/ui/scheduling-state-panel";
import { SlotGridSkeleton } from "@/components/ui/skeleton";
import { useBookableSlots } from "@/lib/queries/slots";
import { groupSlotsByDate } from "@/lib/slot-groups";
import { useBookingStore } from "@/lib/stores/booking";
import {
  SchedulingError,
  schedulingService,
} from "@/lib/services/scheduling";
import type { Slot } from "@/types/scheduling";

const EMPTY_SLOTS: Slot[] = [];

function slotsErrorMessage(cause: unknown): string {
  return cause instanceof SchedulingError
    ? cause.message
    : "Could not load appointment slots.";
}

export default function BookSlotScreen() {
  const doctorId = useBookingStore((state) => state.doctorId);
  const doctorName = useBookingStore((state) => state.doctorName);
  const hold = useBookingStore((state) => state.hold);
  const skipIntake = useBookingStore((state) => state.skipIntake);
  const setSlot = useBookingStore((state) => state.setSlot);

  const slotsQuery = useBookableSlots(doctorId ?? undefined);
  const slots = slotsQuery.data ?? EMPTY_SLOTS;
  const initialLoading = slotsQuery.data === undefined && slotsQuery.isPending;
  const blockingError =
    slotsQuery.isError && slotsQuery.data === undefined ? slotsQuery.error : null;
  const refreshError = slotsQuery.isError ? slotsQuery.error : null;

  const [raceError, setRaceError] = useState<string | null>(null);
  const [raceErrorCode, setRaceErrorCode] = useState<
    SchedulingError["code"] | null
  >(null);
  const [holdingSlotId, setHoldingSlotId] = useState<string | null>(null);

  const sections = useMemo(() => groupSlotsByDate(slots), [slots]);

  const didRedirect = useRef(false);
  useEffect(() => {
    if (!doctorId && !didRedirect.current) {
      didRedirect.current = true;
      router.replace("/");
    }
  }, [doctorId]);

  const mapVariant = (
    slot: Slot,
  ): "available" | "selected" | "held-by-other" | "booked" | "blackout" => {
    if (slot.status === "blackout" || slot.status === "booked") {
      return slot.status;
    }
    if (slot.status === "held") {
      return hold?.slotId === slot.id ? "selected" : "held-by-other";
    }
    if (hold?.slotId === slot.id) {
      return "selected";
    }
    return "available";
  };

  const selectSlot = async (slot: Slot) => {
    if (slot.status !== "available") {
      return;
    }
    setRaceError(null);
    setRaceErrorCode(null);
    setHoldingSlotId(slot.id);
    try {
      const nextHold = await schedulingService.holdSlot(slot.id);
      setSlot(slot.id, slot.startsAt, nextHold);
      if (skipIntake) {
        router.push("/book/confirmation");
      } else {
        router.push("/book/intake");
      }
    } catch (cause) {
      if (cause instanceof SchedulingError) {
        setRaceError(cause.message);
        setRaceErrorCode(cause.code);
        AccessibilityInfo.announceForAccessibility(cause.message);
        if (cause.code === "SLOT_TAKEN" || cause.code === "HOLD_EXPIRED") {
          await slotsQuery.refetch();
        }
      }
    } finally {
      setHoldingSlotId(null);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: "Pick a time" }} />
      {initialLoading ? (
        <View className="flex-1 bg-surface-muted px-4 py-4">
          <SlotGridSkeleton />
        </View>
      ) : blockingError ? (
        <View className="flex-1 justify-center bg-surface-muted px-4">
          <SchedulingStatePanel
            message={slotsErrorMessage(blockingError)}
            onRetry={() => void slotsQuery.refetch()}
          />
        </View>
      ) : slots.length === 0 ? (
        <View className="flex-1 bg-surface-muted px-4 py-4">
          <Card style={{ gap: 4 }}>
            <Text className="text-lg font-semibold text-ink">{doctorName}</Text>
          </Card>
          <RefreshErrorNotice
            message={refreshError ? slotsErrorMessage(refreshError) : null}
          />
          <EmptyState message="No open slots for this doctor. Try another day or doctor." />
        </View>
      ) : (
        <ScrollView
          className="flex-1 bg-surface-muted"
          contentContainerClassName="gap-4 px-4 py-4"
          contentInsetAdjustmentBehavior="automatic"
        >
          <Card style={{ gap: 4 }}>
            <Text className="text-lg font-semibold text-ink">{doctorName}</Text>
            <Text className="text-sm text-ink-muted">
              Tap an open slot to hold it for five minutes.
            </Text>
          </Card>

          <RefreshErrorNotice
            message={refreshError ? slotsErrorMessage(refreshError) : null}
          />

          {sections.map((section) => (
            <View key={section.dateKey} className="gap-2">
              <Text className="text-sm font-semibold text-ink">{section.title}</Text>
              <View
                accessibilityLabel={`Slots on ${section.title}`}
                className="flex-row flex-wrap gap-2"
              >
                {section.slots.map((slot) => {
                  const variant = mapVariant(slot);
                  const label = format(parseISO(slot.startsAt), "h:mm a");
                  return (
                    <SlotChip
                      key={slot.id}
                      label={label}
                      variant={variant}
                      onPress={
                        variant === "available"
                          ? () => void selectSlot(slot)
                          : undefined
                      }
                    />
                  );
                })}
              </View>
            </View>
          ))}

          {raceError ? (
            <SchedulingStatePanel
              compact
              code={raceErrorCode ?? undefined}
              message={raceError}
              onRepick={() => {
                setRaceError(null);
                setRaceErrorCode(null);
              }}
              onRetry={
                raceErrorCode === "NETWORK_ERROR"
                  ? () => void slotsQuery.refetch()
                  : undefined
              }
            />
          ) : null}

          {holdingSlotId ? (
            <Text accessibilityLiveRegion="polite" className="text-sm text-ink-muted">
              Holding slot…
            </Text>
          ) : null}
        </ScrollView>
      )}
    </>
  );
}
