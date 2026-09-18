import { Stack } from "expo-router";

export default function AdminDoctorLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="[id]/blackout" />
      <Stack.Screen name="[id]/schedule" />
    </Stack>
  );
}
