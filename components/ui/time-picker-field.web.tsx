import { createElement } from "react";
import { Text, View } from "react-native";

import { FieldError } from "@/components/ui/field-error";
import { colors } from "@/lib/theme-colors";

interface TimePickerFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  error?: string;
  accessibilityLabel?: string;
}

const inputStyle = {
  boxSizing: "border-box" as const,
  width: "100%",
  minHeight: 48,
  paddingLeft: 16,
  paddingRight: 16,
  fontSize: 16,
  borderRadius: 12,
  borderWidth: 1,
  borderStyle: "solid" as const,
  borderColor: colors["ink-muted"],
  backgroundColor: colors.surface,
  color: colors.ink,
};

export function TimePickerField({
  label,
  value,
  onChange,
  onBlur,
  error,
  accessibilityLabel,
}: TimePickerFieldProps) {
  return (
    <View className="gap-1">
      <Text className="text-sm font-medium text-ink">{label}</Text>
      {createElement("input", {
        type: "time",
        "aria-label": accessibilityLabel ?? label,
        value: value || "",
        onChange: (event: { currentTarget: { value: string } }) => {
          onChange(event.currentTarget.value);
        },
        onBlur,
        style: inputStyle,
      })}
      <FieldError message={error} />
    </View>
  );
}
