import { CalendarClock, CalendarDays, UserRound } from "lucide-react-native";
import { Tabs } from "expo-router";

import { RoleGuard } from "@/components/role-guard";

export default function DoctorLayout() {
  return (
    <RoleGuard role="doctor">
      <Tabs screenOptions={{ headerShown: false }}>
        <Tabs.Screen
          name="agenda"
          options={{
            title: "Agenda",
            tabBarIcon: ({ color, size }) => (
              <CalendarClock color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="schedule"
          options={{
            title: "Schedule",
            tabBarIcon: ({ color, size }) => (
              <CalendarDays color={color} size={size} />
            ),
          }}
        />
        {/* Not "profile": that URL belongs to the patient group (/profile). */}
        <Tabs.Screen
          name="doctor-profile"
          options={{
            title: "Profile",
            tabBarIcon: ({ color, size }) => (
              <UserRound color={color} size={size} />
            ),
          }}
        />
      </Tabs>
    </RoleGuard>
  );
}
