import { createElement } from "react";
import { Text, View } from "react-native";
import { format } from "date-fns";

import { FieldError } from "@/components/ui/field-error";

interface DatePickerFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  error?: string;
  maximumDate?: Date;
  minimumDate?: Date;
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
  borderColor: "#64748B",
  backgroundColor: "#FFFFFF",
  color: "#0F172A",
};

export function DatePickerField({
  label,
  value,
  onChange,
  onBlur,
  error,
  maximumDate,
  minimumDate,
  accessibilityLabel,
}: DatePickerFieldProps) {
  return (
    <View className="gap-1">
      <Text className="text-sm font-medium text-ink">{label}</Text>
      {createElement("input", {
        type: "date",
        "aria-label": accessibilityLabel ?? label,
        value: value || "",
        max: maximumDate ? format(maximumDate, "yyyy-MM-dd") : undefined,
        min: minimumDate ? format(minimumDate, "yyyy-MM-dd") : undefined,
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
