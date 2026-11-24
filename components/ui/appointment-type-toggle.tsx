import { Pressable, Text, View } from "react-native";
import { Building2, Home, Video } from "lucide-react-native";

import { colors } from "@/lib/theme-colors";
import type { AppointmentType } from "@/types/scheduling";

interface AppointmentTypeToggleProps {
  value: AppointmentType;
  onChange: (value: AppointmentType) => void;
}

const options: {
  value: AppointmentType;
  label: string;
  Icon: typeof Building2;
}[] = [
  { value: "in-clinic", label: "In clinic", Icon: Building2 },
  { value: "telehealth", label: "Telehealth", Icon: Video },
  { value: "home-visit", label: "Home visit", Icon: Home },
];

export function AppointmentTypeToggle({
  value,
  onChange,
}: AppointmentTypeToggleProps) {
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel="Appointment type"
      className="flex-row flex-wrap gap-2"
    >
      {options.map(({ value: optionValue, label, Icon }) => {
        const selected = value === optionValue;
        return (
          <Pressable
            key={optionValue}
            accessibilityLabel={label}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            className={[
              "min-h-12 min-w-[7.5rem] flex-1 flex-row items-center justify-center gap-2 rounded-xl border px-3 web:hover:opacity-90",
              selected
                ? "border-primary bg-primary"
                : "border-ink-muted bg-surface",
            ].join(" ")}
            onPress={() => onChange(optionValue)}
          >
            <View className={selected ? "text-surface" : "text-ink"}>
              <Icon color={selected ? colors.surface : colors.ink} size={18} />
            </View>
            <Text
              className={[
                "text-sm font-semibold",
                selected ? "text-surface" : "text-ink",
              ].join(" ")}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
