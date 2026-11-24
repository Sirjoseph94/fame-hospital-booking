import { Text, View } from "react-native";
import { CalendarClock } from "lucide-react-native";

import { Card } from "@/components/ui/card";
import { formatSchedulingTimeRange } from "@/lib/format-scheduling-time";
import { colors } from "@/lib/theme-colors";

interface PostVisitBufferCardProps {
  startsAt: string;
  endsAt: string;
  minutes: number;
}

export function PostVisitBufferCard({
  startsAt,
  endsAt,
  minutes,
}: PostVisitBufferCardProps) {
  const range = formatSchedulingTimeRange(startsAt, endsAt);
  const summary = `Post-visit buffer, ${minutes} minutes, ${range}`;

  return (
    <View accessibilityLabel={summary}>
      <Card style={{ gap: 8, backgroundColor: colors["surface-muted"] }}>
        <View className="flex-row items-center gap-3">
          <CalendarClock color={colors["ink-muted"]} size={20} />
          <View className="min-w-0 flex-1 gap-1">
            <Text className="text-sm font-semibold text-ink-muted">
              Post-visit buffer · {minutes} min
            </Text>
            <Text className="text-sm text-ink-muted" selectable>
              {range}
            </Text>
            <Text className="text-xs text-ink-muted">
              Not bookable — hospital scheduling buffer
            </Text>
          </View>
        </View>
      </Card>
    </View>
  );
}
