import { Stack } from "expo-router";

import { RoleGuard } from "@/components/role-guard";

/**
 * Patient: the tab sections at the bottom of the stack, with the booking
 * flow and visit details opening above them (and closing when finished, so
 * "back" never shows an older booking step).
 */
export default function PatientLayout() {
  return (
    <RoleGuard role="patient">
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="book" />
        <Stack.Screen name="visit" />
      </Stack>
    </RoleGuard>
  );
}
