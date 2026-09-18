import { useMemo, useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { format, isValid, parseISO } from "date-fns";

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

function toDisplayValue(value: string): string {
  if (!value || !isValid(parseISO(value))) {
    return "Select date";
  }
  return format(parseISO(value), "MMM d, yyyy");
}

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
  const [showPicker, setShowPicker] = useState(false);

  const pickerDate = useMemo(() => {
    if (value && isValid(parseISO(value))) {
      return parseISO(value);
    }
    return maximumDate ?? new Date(1990, 0, 1);
  }, [maximumDate, value]);

  const handleNativeChange = (event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === "android") {
      setShowPicker(false);
    }
    if (event.type === "dismissed" || !date) {
      return;
    }
    onChange(format(date, "yyyy-MM-dd"));
    onBlur?.();
  };

  return (
    <View className="gap-1">
      <Text className="text-sm font-medium text-ink">{label}</Text>
      <Pressable
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityRole="button"
        className="min-h-12 justify-center rounded-xl border border-ink-muted bg-surface px-4 web:hover:opacity-90"
        onPress={() => setShowPicker(true)}
      >
        <Text className={value ? "text-base text-ink" : "text-base text-ink-muted"}>
          {toDisplayValue(value)}
        </Text>
      </Pressable>
      {showPicker ? (
        <DateTimePicker
          display={Platform.OS === "ios" ? "spinner" : "default"}
          maximumDate={maximumDate}
          minimumDate={minimumDate}
          mode="date"
          onChange={handleNativeChange}
          value={pickerDate}
        />
      ) : null}
      {Platform.OS === "ios" && showPicker ? (
        <Pressable
          accessibilityLabel="Done choosing date"
          accessibilityRole="button"
          className="min-h-12 items-center justify-center rounded-xl bg-primary"
          onPress={() => {
            setShowPicker(false);
            onBlur?.();
          }}
        >
          <Text className="font-semibold text-surface">Done</Text>
        </Pressable>
      ) : null}
      <FieldError message={error} />
    </View>
  );
}
