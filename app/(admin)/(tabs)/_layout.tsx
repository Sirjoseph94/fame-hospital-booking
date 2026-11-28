import {
  CalendarRange,
  Contact,
  Ellipsis,
  Hospital,
  UsersRound,
} from "lucide-react-native";
import { Tabs } from "expo-router";

import { useBreakpoint } from "@/lib/platform";

/**
 * The admin's main sections. Everything else (reports, settings, detail
 * screens) opens on the stack above these tabs: expo-router redirects a
 * focused hidden tab (`href: null`) to the first tab, so hidden tabs can't
 * hold screens.
 */
export default function AdminTabsLayout() {
  const breakpoint = useBreakpoint();
  // Wide screens navigate with the side nav instead of the tab bar.
  const isWide = breakpoint === "tablet" || breakpoint === "desktop";

  return (
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
          tabBarIcon: ({ color, size }) => <UsersRound color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="appointments"
        options={{
          title: "Appointments",
          tabBarIcon: ({ color, size }) => <CalendarRange color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="capacity"
        options={{
          title: "Clinics",
          tabBarIcon: ({ color, size }) => <Hospital color={color} size={size} />,
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
    </Tabs>
  );
}
