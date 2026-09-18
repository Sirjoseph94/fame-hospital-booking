import { useMemo, useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { format, parseISO, setHours, setMinutes } from "date-fns";

import { FieldError } from "@/components/ui/field-error";

interface TimePickerFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  error?: string;
  accessibilityLabel?: string;
}

function parseTimeValue(value: string): Date {
  if (/^\d{2}:\d{2}$/.test(value)) {
    const base = parseISO("2000-01-01T00:00:00");
    const [hours, minutes] = value.split(":").map(Number);
    return setMinutes(setHours(base, hours), minutes);
  }
  return parseISO("2000-01-01T09:00:00");
}

export function TimePickerField({
  label,
  value,
  onChange,
  onBlur,
  error,
  accessibilityLabel,
}: TimePickerFieldProps) {
  const [showPicker, setShowPicker] = useState(false);
  const pickerDate = useMemo(() => parseTimeValue(value), [value]);

  const handleNativeChange = (event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === "android") {
      setShowPicker(false);
    }
    if (event.type === "dismissed" || !date) {
      return;
    }
    onChange(format(date, "HH:mm"));
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
          {value || "Select time"}
        </Text>
      </Pressable>
      {showPicker ? (
        <DateTimePicker
          display={Platform.OS === "ios" ? "spinner" : "default"}
          mode="time"
          onChange={handleNativeChange}
          value={pickerDate}
        />
      ) : null}
      {Platform.OS === "ios" && showPicker ? (
        <Pressable
          accessibilityLabel="Done choosing time"
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
