import { Text, View } from "react-native";

interface CapacityBarProps {
  bookedPercent: number;
  availablePercent: number;
  blackoutPercent: number;
  label: string;
}

export function CapacityBar({
  bookedPercent,
  availablePercent,
  blackoutPercent,
  label,
}: CapacityBarProps) {
  return (
    <View accessibilityLabel={label}>
      <View className="h-3 flex-row overflow-hidden rounded-full bg-surface-muted">
        {bookedPercent > 0 ? (
          <View
            className="h-full bg-primary"
            style={{ width: `${bookedPercent}%` }}
          />
        ) : null}
        {availablePercent > 0 ? (
          <View
            className="h-full bg-available"
            style={{ width: `${availablePercent}%` }}
          />
        ) : null}
        {blackoutPercent > 0 ? (
          <View
            className="h-full bg-ink-muted"
            style={{ width: `${blackoutPercent}%` }}
          />
        ) : null}
      </View>
      <Text className="mt-2 text-xs text-ink-muted">{label}</Text>
    </View>
  );
}
