import { Pressable, Text } from "react-native";
import { ChevronLeft } from "lucide-react-native";

import { colors } from "@/lib/theme-colors";

interface BackButtonProps {
  onPress: () => void;
  /** Visible text next to the chevron; also the accessibility label. */
  label?: string;
  /** Icon-only (48pt target) for compact headers. */
  iconOnly?: boolean;
}

export function BackButton({ onPress, label = "Back", iconOnly = false }: BackButtonProps) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      className={[
        "min-h-12 flex-row items-center self-start rounded-full web:hover:bg-surface active:opacity-70",
        iconOnly ? "w-12 justify-center" : "gap-1 pr-3",
      ].join(" ")}
      hitSlop={4}
      onPress={onPress}
    >
      <ChevronLeft color={iconOnly ? colors.ink : colors.primary} size={24} />
      {iconOnly ? null : <Text className="text-base font-semibold text-primary">{label}</Text>}
    </Pressable>
  );
}
