import { CalendarDays, House, UserRound } from "lucide-react-native";
import { Tabs } from "expo-router";

import { RoleGuard } from "@/components/role-guard";

export default function PatientLayout() {
  return (
    <RoleGuard role="patient">
      <Tabs backBehavior="history" screenOptions={{ headerShown: false }}>
        <Tabs.Screen
          name="index"
          options={{
            title: "Home",
            tabBarIcon: ({ color, size }) => (
              <House color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="visits"
          options={{
            title: "My Visits",
            tabBarIcon: ({ color, size }) => (
              <CalendarDays color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: "Profile",
            tabBarIcon: ({ color, size }) => (
              <UserRound color={color} size={size} />
            ),
          }}
        />
        {/* Reset when left, so "back" never shows an older visit or booking step. */}
        <Tabs.Screen name="book" options={{ href: null, popToTopOnBlur: true }} />
        <Tabs.Screen name="visit" options={{ href: null, popToTopOnBlur: true }} />
      </Tabs>
    </RoleGuard>
  );
}
