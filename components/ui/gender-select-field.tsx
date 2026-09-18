import { Pressable, Text, View } from "react-native";

import { FieldError } from "@/components/ui/field-error";
import type { GenderValue } from "@/lib/validation/forms";

const options: { value: GenderValue; label: string }[] = [
  { value: "female", label: "Female" },
  { value: "male", label: "Male" }
];

interface GenderSelectFieldProps {
  label?: string;
  value: GenderValue | "";
  onChange: (value: GenderValue) => void;
  error?: string;
}

export function GenderSelectField({
  label = "Gender",
  value,
  onChange,
  error,
}: GenderSelectFieldProps) {
  return (
    <View className="gap-1">
      <Text className="text-sm font-medium text-ink">{label}</Text>
      <View className="flex-row flex-wrap gap-2">
        {options.map((option) => {
          const selected = value === option.value;
          return (
            <Pressable
              key={option.value}
              accessibilityLabel={option.label}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              className={[
                "min-h-12 justify-center rounded-full border px-4 py-3 web:hover:opacity-90",
                selected
                  ? "border-primary bg-primary"
                  : "border-ink-muted bg-surface",
              ].join(" ")}
              onPress={() => onChange(option.value)}
            >
              <Text
                className={[
                  "text-base",
                  selected ? "text-surface" : "text-ink",
                ].join(" ")}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <FieldError message={error} />
    </View>
  );
}
