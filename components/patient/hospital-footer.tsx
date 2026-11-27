import { Linking, Pressable, Text, View } from "react-native";

import { LegalLinks } from "@/components/legal/legal-links";
import { Card } from "@/components/ui/card";
import { hospitalInfo } from "@/lib/hospital-info";

export function HospitalFooter() {
  return (
    <Card style={{ gap: 8 }}>
      <Text className="text-base font-semibold text-ink">About & contact</Text>
      <Text className="text-sm leading-5 text-ink-muted">{hospitalInfo.about}</Text>
      <Text className="text-sm text-ink-muted" selectable>
        {hospitalInfo.hours}
      </Text>
      <View className="gap-2 pt-1">
        <Pressable
          accessibilityLabel={`Call ${hospitalInfo.phone}`}
          accessibilityRole="link"
          className="min-h-12 justify-center web:hover:opacity-80"
          onPress={() => void Linking.openURL(`tel:${hospitalInfo.phone.replace(/[^\d+]/g, "")}`)}
        >
          <Text className="text-base font-medium text-primary" selectable>
            {hospitalInfo.phone}
          </Text>
        </Pressable>
        <Pressable
          accessibilityLabel={`Email ${hospitalInfo.email}`}
          accessibilityRole="link"
          className="min-h-12 justify-center web:hover:opacity-80"
          onPress={() => void Linking.openURL(`mailto:${hospitalInfo.email}`)}
        >
          <Text className="text-base font-medium text-primary" selectable>
            {hospitalInfo.email}
          </Text>
        </Pressable>
      </View>
      <View className="-mx-2 items-start">
        <LegalLinks />
      </View>
    </Card>
  );
}
