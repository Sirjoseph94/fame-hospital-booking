import { View } from "react-native";
import {
  CalendarRange,
  Contact,
  Ellipsis,
  Hospital,
  UsersRound,
} from "lucide-react-native";
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
            backBehavior="history"
            screenOptions={{
              headerShown: false,
              tabBarStyle: isWide ? { display: "none" } : undefined,
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
                title: "Clinics",
                tabBarIcon: ({ color, size }) => (
                  <Hospital color={color} size={size} />
                ),
              }}
            />
            <Tabs.Screen
              name="patients"
              options={{
                title: "Patients",
                tabBarIcon: ({ color, size }) => <Contact color={color} size={size} />,
              }}
            />
            <Tabs.Screen
              name="more"
              options={{
                title: "More",
                tabBarIcon: ({ color, size }) => <Ellipsis color={color} size={size} />,
              }}
            />
            {/* Reached from "More" on phones and from the side nav on wide screens. */}
            <Tabs.Screen name="reports" options={{ href: null, title: "Reports" }} />
            <Tabs.Screen name="activity" options={{ href: null, title: "Activity" }} />
            <Tabs.Screen name="settings" options={{ href: null, title: "Settings" }} />
            {/* Detail stacks reset when left, so "back" never shows an older detail. */}
            <Tabs.Screen name="doctor" options={{ href: null, popToTopOnBlur: true }} />
            <Tabs.Screen name="patient" options={{ href: null, popToTopOnBlur: true }} />
            <Tabs.Screen name="session" options={{ href: null, popToTopOnBlur: true }} />
          </Tabs>
        </View>
      </View>
    </RoleGuard>
  );
}
