import { useEffect, useState } from "react";

import { useAppForeground } from "@/lib/hooks/use-app-foreground";

function remainingSeconds(expiresAt: string): number {
  return Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
}

export function formatHoldCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function useSlotHoldCountdown(
  expiresAt: string | null,
  onExpired?: () => void,
): {
  secondsLeft: number;
  label: string;
  isExpired: boolean;
} {
  const [secondsLeft, setSecondsLeft] = useState(() =>
    expiresAt ? remainingSeconds(expiresAt) : 0,
  );

  useAppForeground(() => {
    if (!expiresAt) {
      return;
    }
    setSecondsLeft(remainingSeconds(expiresAt));
  });

  useEffect(() => {
    if (!expiresAt) {
      return;
    }
    const timer = setInterval(() => {
      setSecondsLeft((current) => {
        const next = remainingSeconds(expiresAt);
        if (current > 0 && next <= 0) {
          onExpired?.();
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [expiresAt, onExpired]);

  return {
    secondsLeft,
    label: formatHoldCountdown(secondsLeft),
    isExpired: expiresAt ? secondsLeft <= 0 : false,
  };
}
