import { Pressable, Text, View } from "react-native";

import { Card } from "@/components/ui/card";
import {
  schedulingErrorRepickLabel,
  schedulingErrorShowsRepick,
  schedulingErrorShowsRetry,
} from "@/lib/scheduling-error-ui";
import type { SchedulingErrorCode } from "@/lib/services/scheduling";

interface SchedulingStatePanelProps {
  message: string;
  code?: SchedulingErrorCode;
  onRetry?: () => void;
  onRepick?: () => void;
  compact?: boolean;
}

export function SchedulingStatePanel({
  message,
  code,
  onRetry,
  onRepick,
  compact = false,
}: SchedulingStatePanelProps) {
  const showRetry =
    Boolean(onRetry) &&
    (code === undefined || schedulingErrorShowsRetry(code));
  const showRepick =
    Boolean(onRepick) &&
    (code === undefined || schedulingErrorShowsRepick(code));

  const body = (
    <View className="gap-3">
      <Text accessibilityLiveRegion="assertive" className="text-base text-ink">
        {message}
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {showRetry && onRetry ? (
          <Pressable
            accessibilityLabel="Retry"
            accessibilityRole="button"
            className="min-h-12 flex-1 items-center justify-center rounded-xl bg-primary px-4 web:hover:opacity-90"
            onPress={onRetry}
          >
            <Text className="font-semibold text-surface">Retry</Text>
          </Pressable>
        ) : null}
        {showRepick && onRepick ? (
          <Pressable
            accessibilityLabel={
              code ? schedulingErrorRepickLabel(code) : "Choose another session"
            }
            accessibilityRole="button"
            className="min-h-12 flex-1 items-center justify-center rounded-xl border border-primary px-4 web:hover:opacity-90"
            onPress={onRepick}
          >
            <Text className="font-semibold text-primary">
              {code ? schedulingErrorRepickLabel(code) : "Choose another session"}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );

  if (compact) {
    return body;
  }

  return <Card>{body}</Card>;
}
