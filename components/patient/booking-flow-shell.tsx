import type { PropsWithChildren } from "react";
import { View } from "react-native";

import { BookingStepHeader } from "@/components/patient/booking-step-header";

export function BookingFlowShell({ children }: PropsWithChildren) {
  return (
    <View className="flex-1 bg-surface-muted">
      <BookingStepHeader />
      {children}
    </View>
  );
}
