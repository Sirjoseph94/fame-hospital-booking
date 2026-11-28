import { Pressable, Text, View } from "react-native";
import { usePathname, useRouter } from "expo-router";
import {
  CalendarRange,
  ChartColumn,
  Contact,
  History,
  Hospital,
  Settings,
  UsersRound,
} from "lucide-react-native";

import { colors } from "@/lib/theme-colors";

const links = [
  { href: "/roster", label: "Roster", Icon: UsersRound },
  { href: "/appointments", label: "Appointments", Icon: CalendarRange },
  { href: "/capacity", label: "Clinics", Icon: Hospital },
  { href: "/patients", label: "Patients", Icon: Contact },
  { href: "/reports", label: "Reports", Icon: ChartColumn },
  { href: "/activity", label: "Activity", Icon: History },
  { href: "/settings", label: "Settings", Icon: Settings },
] as const;

function isActivePath(pathname: string, href: string): boolean {
  if (pathname === href || pathname.startsWith(`${href}/`)) {
    return true;
  }
  // Session queues belong to Clinics; doctor schedules to the roster.
  if (href === "/capacity" && pathname.startsWith("/session/")) return true;
  if (href === "/roster" && pathname.startsWith("/doctor/")) return true;
  if (href === "/patients" && pathname.startsWith("/patient/")) return true;
  return false;
}

export function AdminSideNav() {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <View
      accessibilityLabel="Admin navigation"
      className="w-60 border-r border-ink-muted bg-surface px-3 py-4"
    >
      <Text className="px-3 pb-4 text-xs font-semibold uppercase tracking-wide text-ink-muted">
        Hospital admin
      </Text>
      <View className="gap-1">
        {links.map(({ href, label, Icon }) => {
          const selected = isActivePath(pathname, href);
          return (
            <Pressable
              key={href}
              accessibilityLabel={label}
              accessibilityRole="link"
              accessibilityState={{ selected }}
              className={[
                "min-h-12 flex-row items-center gap-3 rounded-xl px-3 web:hover:bg-surface-muted",
                selected ? "bg-surface-muted" : "",
              ].join(" ")}
              // navigate, not push: going back to a tab section returns to the
              // existing tabs instead of stacking another copy on top.
              onPress={() => router.navigate(href)}
            >
              <View className={selected ? "text-primary" : "text-ink-muted"}>
                <Icon color={selected ? colors.primary : colors["ink-muted"]} size={20} />
              </View>
              <Text
                className={[
                  "text-base font-medium",
                  selected ? "text-ink" : "text-ink-muted",
                ].join(" ")}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
