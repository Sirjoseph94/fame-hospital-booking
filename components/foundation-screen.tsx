import { ScrollView, Text, View } from "react-native";

import { ShellHeader } from "@/components/shell-header";
import { Card } from "@/components/ui/card";

interface FoundationScreenProps {
  title: string;
  description: string;
}

export function FoundationScreen({
  title,
  description,
}: FoundationScreenProps) {
  return (
    <View className="flex-1 bg-surface-muted">
      <ShellHeader title={title} />
      <ScrollView
        contentContainerClassName="gap-4 px-4 pb-8 pt-2"
        contentInsetAdjustmentBehavior="automatic"
      >
        <Card>
          <Text className="text-lg font-semibold text-ink">
            Foundation ready
          </Text>
          <Text className="mt-2 text-base leading-6 text-ink-muted">
            {description}
          </Text>
        </Card>
      </ScrollView>
    </View>
  );
}
