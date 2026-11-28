import { Pressable, Text, View } from "react-native";
import { Check } from "lucide-react-native";

import { formatSessionTimes, placesLeftLabel } from "@/lib/session-groups";
import { colors } from "@/lib/theme-colors";
import type { ClinicSession } from "@/types/scheduling";

interface SessionOptionProps {
  session: ClinicSession;
  selected?: boolean;
  /** Shown instead of the places count, e.g. "Your current session". */
  note?: string;
  disabled?: boolean;
  onPress?: () => void;
}

/** A tappable clinic session: time window and places left. */
export function SessionOption({
  session,
  selected = false,
  note,
  disabled = false,
  onPress,
}: SessionOptionProps) {
  const times = formatSessionTimes(session);
  const places = placesLeftLabel(session.placesLeft);
  const lowPlaces = session.placesLeft > 0 && session.placesLeft <= 3;

  return (
    <Pressable
      accessibilityLabel={`${times}, ${note ?? places}${session.room ? `, ${session.room}` : ""}`}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled: disabled || !onPress }}
      className={[
        "min-h-14 flex-row items-center justify-between gap-3 rounded-xl border px-4 py-3",
        selected ? "border-primary bg-primary/10" : "border-ink-muted/30 bg-surface",
        disabled ? "opacity-50" : "web:hover:border-primary",
      ].join(" ")}
      disabled={disabled || !onPress}
      onPress={onPress}
    >
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="text-base font-semibold text-ink">{times}</Text>
        <Text
          className={`text-sm ${lowPlaces && !note ? "font-medium text-warning" : "text-ink-muted"}`}
        >
          {note ?? places}
          {session.room ? <Text className="text-ink-muted"> · {session.room}</Text> : null}
        </Text>
      </View>
      {selected ? <Check color={colors.primary} size={20} /> : null}
    </Pressable>
  );
}
