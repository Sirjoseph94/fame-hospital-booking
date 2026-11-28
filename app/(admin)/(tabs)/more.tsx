import type { ComponentType } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { router, type Href } from "expo-router";
import { ChartColumn, ChevronRight, History, Info, Settings } from "lucide-react-native";

import { ShellHeader } from "@/components/shell-header";
import { Card } from "@/components/ui/card";
import { colors } from "@/lib/theme-colors";

const items: {
  href: Href;
  label: string;
  description: string;
  Icon: ComponentType<{ color?: string; size?: number }>;
}[] = [
  { href: "/reports", label: "Reports", description: "Attendance, no-shows and waiting times", Icon: ChartColumn },
  { href: "/activity", label: "Activity", description: "Failed messages and admin changes", Icon: History },
  { href: "/settings", label: "Settings", description: "Hospital details, booking rules, check-in poster", Icon: Settings },
  { href: "/about", label: "About", description: "What patients see about the hospital", Icon: Info },
];

/** Admin (phones): the pages that don't fit in the tab bar. */
export default function AdminMoreScreen() {
  return (
    <View className="flex-1 bg-surface-muted">
      <ShellHeader title="More" />
      <ScrollView contentContainerClassName="px-4 pb-8 pt-2" contentInsetAdjustmentBehavior="automatic">
        <Card style={{ paddingVertical: 4 }}>
          {items.map(({ href, label, description, Icon }, index) => (
            <Pressable
              key={label}
              accessibilityHint={description}
              accessibilityLabel={label}
              accessibilityRole="link"
              className={[
                "min-h-16 flex-row items-center gap-3 py-3 web:hover:opacity-80 active:opacity-70",
                index > 0 ? "border-t border-surface-muted" : "",
              ].join(" ")}
              onPress={() => router.push(href)}
            >
              <Icon color={colors.primary} size={22} />
              <View className="min-w-0 flex-1">
                <Text className="text-base font-semibold text-ink">{label}</Text>
                <Text className="text-sm text-ink-muted">{description}</Text>
              </View>
              <ChevronRight color={colors["ink-muted"]} size={20} />
            </Pressable>
          ))}
        </Card>
      </ScrollView>
    </View>
  );
}
