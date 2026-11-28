import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { ChevronRight, Info } from "lucide-react-native";

import { LegalLinks } from "@/components/legal/legal-links";
import { Card } from "@/components/ui/card";
import { useHospitalInfo } from "@/lib/queries/hospital-info";
import { colors } from "@/lib/theme-colors";

/** Profile card: About the hospital (contact details) and the legal pages. */
export function AboutLinksCard() {
  const { data: info } = useHospitalInfo();
  return (
    <Card style={{ gap: 4 }}>
      <Pressable
        accessibilityLabel={`About ${info?.name ?? "the hospital"} and contact details`}
        accessibilityRole="link"
        className="min-h-12 flex-row items-center gap-3 rounded-xl web:hover:bg-surface-muted active:opacity-70"
        onPress={() => router.push("/about")}
      >
        <Info color={colors.primary} size={20} />
        <View className="min-w-0 flex-1">
          <Text className="text-base font-semibold text-ink">About {info?.name ?? "the hospital"}</Text>
          <Text className="text-sm text-ink-muted">Contact details, opening hours and how booking works</Text>
        </View>
        <ChevronRight color={colors["ink-muted"]} size={20} />
      </Pressable>
      <View className="-mx-2 items-start">
        <LegalLinks />
      </View>
    </Card>
  );
}
