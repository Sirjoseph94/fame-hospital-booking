import { View } from "react-native";
import { CalendarRange, ChartNoAxesColumn, UsersRound } from "lucide-react-native";
import { Tabs } from "expo-router";

import { AdminSideNav } from "@/components/admin/admin-side-nav";
import { RoleGuard } from "@/components/role-guard";
import { useBreakpoint } from "@/lib/platform";

export default function AdminLayout() {
  const breakpoint = useBreakpoint();
  const isWide =
    breakpoint === "tablet" || breakpoint === "desktop";

  return (
    <RoleGuard role="admin">
      <View className="min-h-0 flex-1 flex-row bg-surface-muted">
        {isWide ? <AdminSideNav /> : null}
        <View className="min-w-0 flex-1">
          <Tabs
            screenOptions={{
              headerShown: false,
              tabBarStyle: isWide ? { display: "none" } : undefined,
              tabBarActiveTintColor: undefined,
            }}
          >
            <Tabs.Screen
              name="roster"
              options={{
                title: "Roster",
                tabBarIcon: ({ color, size }) => (
                  <UsersRound color={color} size={size} />
                ),
              }}
            />
            <Tabs.Screen
              name="appointments"
              options={{
                title: "Appointments",
                tabBarIcon: ({ color, size }) => (
                  <CalendarRange color={color} size={size} />
                ),
              }}
            />
            <Tabs.Screen
              name="capacity"
              options={{
                title: "Capacity",
                tabBarIcon: ({ color, size }) => (
                  <ChartNoAxesColumn color={color} size={size} />
                ),
              }}
            />
            <Tabs.Screen name="doctor" options={{ href: null }} />
          </Tabs>
        </View>
      </View>
    </RoleGuard>
  );
}
