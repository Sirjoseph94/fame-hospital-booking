import { View } from "react-native";
import { Stack } from "expo-router";

import { AdminSideNav } from "@/components/admin/admin-side-nav";
import { RoleGuard } from "@/components/role-guard";
import { useBreakpoint } from "@/lib/platform";

/**
 * Admin: the tab sections at the bottom of the stack, with reports, activity,
 * settings and the doctor / patient / session detail screens opening above
 * them. On wide screens a side nav replaces the tab bar.
 */
export default function AdminLayout() {
  const breakpoint = useBreakpoint();
  const isWide = breakpoint === "tablet" || breakpoint === "desktop";

  return (
    <RoleGuard role="admin">
      <View className="min-h-0 flex-1 flex-row bg-surface-muted">
        {isWide ? <AdminSideNav /> : null}
        <View className="min-w-0 flex-1">
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="reports" options={{ title: "Reports" }} />
            <Stack.Screen name="activity" options={{ title: "Activity" }} />
            <Stack.Screen name="settings" options={{ title: "Settings" }} />
            <Stack.Screen name="doctor" />
            <Stack.Screen name="patient" />
            <Stack.Screen name="session" />
          </Stack>
        </View>
      </View>
    </RoleGuard>
  );
}
