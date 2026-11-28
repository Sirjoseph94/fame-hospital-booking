import { Text, View } from "react-native";

interface CapacityBarProps {
  /** 0–100. */
  bookedPercent: number;
  label: string;
  muted?: boolean;
}

/** How full a session is: booked share of its patient limit. */
export function CapacityBar({ bookedPercent, label, muted = false }: CapacityBarProps) {
  return (
    <View accessibilityLabel={label}>
      <View className="h-3 flex-row overflow-hidden rounded-full bg-surface-muted">
        {bookedPercent > 0 ? (
          <View
            className={`h-full ${muted ? "bg-ink-muted" : bookedPercent >= 100 ? "bg-warning" : "bg-primary"}`}
            style={{ width: `${Math.min(bookedPercent, 100)}%` }}
          />
        ) : null}
      </View>
      <Text className="mt-2 text-xs text-ink-muted">{label}</Text>
    </View>
  );
}
