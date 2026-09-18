import { Pressable, Text, View } from "react-native";

export type SlotChipVariant =
  | "available"
  | "selected"
  | "held-by-other"
  | "booked"
  | "blackout";

interface SlotChipProps {
  label: string;
  variant: SlotChipVariant;
  onPress?: () => void;
  accessibilityHint?: string;
}

const variantStyles: Record<
  SlotChipVariant,
  { container: string; text: string; disabled: boolean }
> = {
  available: {
    container: "border-available bg-surface",
    text: "text-ink",
    disabled: false,
  },
  selected: {
    container: "border-primary bg-primary",
    text: "text-surface",
    disabled: false,
  },
  "held-by-other": {
    container: "border-ink-muted bg-surface-muted opacity-70",
    text: "text-ink-muted",
    disabled: true,
  },
  booked: {
    container: "border-ink-muted bg-surface-muted",
    text: "text-ink-muted",
    disabled: true,
  },
  blackout: {
    container: "border-ink-muted bg-surface-muted opacity-60",
    text: "text-ink-muted",
    disabled: true,
  },
};

const variantLabels: Record<SlotChipVariant, string> = {
  available: "Available slot",
  selected: "Selected slot",
  "held-by-other": "Held by another patient",
  booked: "Booked slot",
  blackout: "Unavailable slot",
};

export function SlotChip({
  label,
  variant,
  onPress,
  accessibilityHint,
}: SlotChipProps) {
  const styles = variantStyles[variant];

  return (
    <Pressable
      accessibilityHint={accessibilityHint}
      accessibilityLabel={`${variantLabels[variant]}, ${label}`}
      accessibilityRole="button"
      accessibilityState={{ disabled: styles.disabled, selected: variant === "selected" }}
      className={[
        "min-h-12 min-w-[7rem] items-center justify-center rounded-xl border px-3 py-2 web:hover:opacity-90",
        styles.container,
      ].join(" ")}
      disabled={styles.disabled}
      onPress={onPress}
    >
      <Text className={`text-base font-semibold ${styles.text}`} selectable>
        {label}
      </Text>
      {variant === "held-by-other" ? (
        <View className="mt-0.5">
          <Text className="text-xs text-ink-muted">Held</Text>
        </View>
      ) : null}
    </Pressable>
  );
}
