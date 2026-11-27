import { Text, View } from "react-native";
import { usePathname } from "expo-router";

import { useBookingStore } from "@/lib/stores/booking";

const steps = [
  { segment: "doctor", label: "Doctor" },
  { segment: "session", label: "Session" },
  { segment: "intake", label: "Details" },
  { segment: "confirmation", label: "Confirm" },
] as const;

function currentSegment(
  pathname: string,
): (typeof steps)[number]["segment"] | null {
  if (pathname.includes("/book/confirmation")) {
    return "confirmation";
  }
  if (pathname.includes("/book/intake")) {
    return "intake";
  }
  if (pathname.includes("/book/session")) {
    return "session";
  }
  if (pathname.includes("/book/doctor")) {
    return "doctor";
  }
  return null;
}

export function BookingStepHeader() {
  const pathname = usePathname();
  const skipIntake = useBookingStore((state) => state.skipIntake);

  if (!pathname.includes("/book/")) {
    return null;
  }

  const visibleSteps = skipIntake
    ? steps.filter((step) => step.segment !== "intake")
    : steps;
  const active = currentSegment(pathname);
  const activeVisibleIndex = visibleSteps.findIndex(
    (step) => step.segment === active,
  );

  return (
    <View
      accessibilityRole="header"
      className="border-b border-surface-muted bg-surface px-4 py-3"
    >
      <View className="flex-row items-center justify-between gap-1">
        {visibleSteps.map((step, index) => {
          const isActive = index === activeVisibleIndex;
          const isComplete =
            activeVisibleIndex >= 0 && index < activeVisibleIndex;
          return (
            <View key={step.segment} className="min-w-0 flex-1 items-center gap-1">
              <View
                className={`h-2 w-2 rounded-full ${
                  isActive
                    ? "bg-primary"
                    : isComplete
                      ? "bg-primary/40"
                      : "bg-surface-muted"
                }`}
              />
              <Text
                className={`text-center text-xs ${
                  isActive ? "font-semibold text-ink" : "text-ink-muted"
                }`}
                numberOfLines={1}
              >
                {step.label}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}
