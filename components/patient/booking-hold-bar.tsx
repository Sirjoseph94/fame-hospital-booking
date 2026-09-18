import { AccessibilityInfo, Pressable, Text, View } from "react-native";

import { useSlotHoldCountdown } from "@/lib/hooks/use-slot-hold-countdown";
import { schedulingService } from "@/lib/services/scheduling";
import { useBookingStore } from "@/lib/stores/booking";

export function BookingHoldBar() {
  const slotId = useBookingStore((state) => state.slotId);
  const hold = useBookingStore((state) => state.hold);
  const setHold = useBookingStore((state) => state.setHold);
  const resetBookingDraft = useBookingStore((state) => state.resetBookingDraft);

  const onHoldExpired = () => {
    setHold(null);
    AccessibilityInfo.announceForAccessibility("Slot hold expired.");
  };

  const { label, isExpired } = useSlotHoldCountdown(
    hold?.expiresAt ?? null,
    onHoldExpired,
  );

  if (!slotId || !hold || isExpired) {
    return null;
  }

  const release = () => {
    void schedulingService.releaseHold(slotId).finally(() => {
      resetBookingDraft();
      AccessibilityInfo.announceForAccessibility(
        "Slot released. You can pick another time.",
      );
    });
  };

  return (
    <View className="border-b border-primary/20 bg-primary/10 px-4 py-2">
      <View className="flex-row items-center justify-between gap-3">
        <Text accessibilityLiveRegion="polite" className="flex-1 text-sm text-ink">
          Hold expires in {label}
        </Text>
        <Pressable
          accessibilityLabel="Release this slot hold"
          accessibilityRole="button"
          className="min-h-10 justify-center rounded-lg border border-primary px-3 web:hover:opacity-90"
          onPress={release}
        >
          <Text className="text-sm font-semibold text-primary">Release</Text>
        </Pressable>
      </View>
    </View>
  );
}
