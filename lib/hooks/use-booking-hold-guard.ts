import { useEffect, useRef } from "react";
import { AccessibilityInfo } from "react-native";
import { router } from "expo-router";

import {
  SchedulingError,
  schedulingService,
} from "@/lib/services/scheduling";
import { useBookingStore } from "@/lib/stores/booking";

function isHoldExpired(expiresAt: string): boolean {
  const ms = new Date(expiresAt).getTime();
  return !Number.isFinite(ms) || ms <= Date.now();
}

/** Validates persisted booking holds when entering the book stack. */
export function useBookingHoldGuard(): void {
  const hold = useBookingStore((state) => state.hold);
  const slotId = useBookingStore((state) => state.slotId);
  const setHold = useBookingStore((state) => state.setHold);
  const resetBookingDraft = useBookingStore((state) => state.resetBookingDraft);
  const checkedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!slotId || !hold) {
      checkedRef.current = null;
      return;
    }

    const checkKey = `${slotId}:${hold.expiresAt}`;
    if (checkedRef.current === checkKey) {
      return;
    }

    if (isHoldExpired(hold.expiresAt)) {
      checkedRef.current = checkKey;
      void schedulingService.releaseHold(slotId).finally(() => {
        resetBookingDraft();
        AccessibilityInfo.announceForAccessibility(
          "Your slot hold expired. Start booking again from Home.",
        );
        router.replace("/");
      });
      return;
    }

    let cancelled = false;
    void schedulingService
      .syncBookingHold(slotId, hold)
      .then((synced) => {
        if (cancelled) {
          return;
        }
        checkedRef.current = checkKey;
        if (synced.expiresAt !== hold.expiresAt) {
          setHold(synced);
        }
      })
      .catch((cause) => {
        if (cancelled) {
          return;
        }
        checkedRef.current = checkKey;
        if (
          cause instanceof SchedulingError &&
          (cause.code === "HOLD_EXPIRED" || cause.code === "SLOT_TAKEN")
        ) {
          void schedulingService.releaseHold(slotId).finally(() => {
            resetBookingDraft();
            AccessibilityInfo.announceForAccessibility(cause.message);
            router.replace("/");
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [hold, resetBookingDraft, setHold, slotId]);
}
