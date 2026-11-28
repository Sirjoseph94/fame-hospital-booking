import { CalendarDays, House, UserRound } from "lucide-react-native";
import { Tabs } from "expo-router";

/**
 * The patient's main sections. Booking and visit details open on the stack
 * above these tabs: expo-router redirects a focused hidden tab
 * (`href: null`) to the first tab, so hidden tabs can't hold screens.
 */
export default function PatientTabsLayout() {
  return (
    <Tabs backBehavior="history" screenOptions={{ headerShown: false }}>
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size }) => <House color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="visits"
        options={{
          title: "My Visits",
          tabBarIcon: ({ color, size }) => <CalendarDays color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size }) => <UserRound color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
