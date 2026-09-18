import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  ScrollView,
  Text,
  View,
} from "react-native";
import { Stack, router } from "expo-router";
import { format, parseISO } from "date-fns";

import { SlotChip } from "@/components/ui/slot-chip";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SchedulingStatePanel } from "@/components/ui/scheduling-state-panel";
import { SlotGridSkeleton } from "@/components/ui/skeleton";
import { groupSlotsByDate } from "@/lib/slot-groups";
import { useBookingStore } from "@/lib/stores/booking";
import {
  SchedulingError,
  schedulingService,
} from "@/lib/services/scheduling";
import type { Slot } from "@/types/scheduling";

export default function BookSlotScreen() {
  const doctorId = useBookingStore((state) => state.doctorId);
  const doctorName = useBookingStore((state) => state.doctorName);
  const hold = useBookingStore((state) => state.hold);
  const skipIntake = useBookingStore((state) => state.skipIntake);
  const setSlot = useBookingStore((state) => state.setSlot);

  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [raceError, setRaceError] = useState<string | null>(null);
  const [raceErrorCode, setRaceErrorCode] = useState<
    SchedulingError["code"] | null
  >(null);
  const [holdingSlotId, setHoldingSlotId] = useState<string | null>(null);

  const sections = useMemo(() => groupSlotsByDate(slots), [slots]);

  const load = useCallback(async () => {
    if (!doctorId) {
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const rows = await schedulingService.listSlots(doctorId);
      setSlots(rows);
    } catch (cause) {
      const message =
        cause instanceof SchedulingError
          ? cause.message
          : "Could not load appointment slots.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [doctorId]);

  const didRedirect = useRef(false);
  useEffect(() => {
    if (!doctorId) {
      if (!didRedirect.current) {
        didRedirect.current = true;
        router.replace("/");
      }
      return;
    }
    const task = setTimeout(() => void load(), 0);
    return () => clearTimeout(task);
  }, [doctorId, load]);

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
          await load();
        }
      }
    } finally {
      setHoldingSlotId(null);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: "Pick a time" }} />
      {loading ? (
        <View className="flex-1 bg-surface-muted px-4 py-4">
          <SlotGridSkeleton />
        </View>
      ) : error ? (
        <View className="flex-1 justify-center bg-surface-muted px-4">
          <SchedulingStatePanel
            message={error}
            onRetry={() => void load()}
          />
        </View>
      ) : slots.length === 0 ? (
        <View className="flex-1 bg-surface-muted px-4 py-4">
          <Card style={{ gap: 4 }}>
            <Text className="text-lg font-semibold text-ink">{doctorName}</Text>
          </Card>
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
                raceErrorCode === "NETWORK_ERROR" ? () => void load() : undefined
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
