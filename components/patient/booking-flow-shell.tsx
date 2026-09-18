import type { PropsWithChildren } from "react";
import { View } from "react-native";

import { BookingHoldBar } from "@/components/patient/booking-hold-bar";
import { BookingStepHeader } from "@/components/patient/booking-step-header";
import { useBookingHoldGuard } from "@/lib/hooks/use-booking-hold-guard";

export function BookingFlowShell({ children }: PropsWithChildren) {
  useBookingHoldGuard();

  return (
    <View className="flex-1 bg-surface-muted">
      <BookingHoldBar />
      <BookingStepHeader />
      {children}
    </View>
  );
}
