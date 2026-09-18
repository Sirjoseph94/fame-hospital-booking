import { useEffect, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";

import { isWeb } from "@/lib/platform";

/** Fires when the app returns to the foreground (native AppState or web tab visible). */
export function useAppForeground(onForeground: () => void): void {
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    const task = setTimeout(() => onForeground(), 0);
    return () => clearTimeout(task);
  }, [generation, onForeground]);

  useEffect(() => {
    if (isWeb && typeof document !== "undefined") {
      const handleVisibility = () => {
        if (document.visibilityState === "visible") {
          setGeneration((value) => value + 1);
        }
      };
      document.addEventListener("visibilitychange", handleVisibility);
      return () => {
        document.removeEventListener("visibilitychange", handleVisibility);
      };
    }

    const handleAppState = (state: AppStateStatus) => {
      if (state === "active") {
        setGeneration((value) => value + 1);
      }
    };
    const subscription = AppState.addEventListener("change", handleAppState);
    return () => subscription.remove();
  }, []);
}
