import { Stack } from "expo-router";

import { BookingFlowShell } from "@/components/patient/booking-flow-shell";

export default function BookLayout() {
  return (
    <BookingFlowShell>
      <Stack
        screenOptions={{
          headerShown: true,
          headerShadowVisible: false,
          headerBackTitle: "Back",
        }}
      />
    </BookingFlowShell>
  );
}
