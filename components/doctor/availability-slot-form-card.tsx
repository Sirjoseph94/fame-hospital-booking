import { ActivityIndicator, Pressable, Text } from "react-native";
import { Controller, type Control } from "react-hook-form";

import { Card } from "@/components/ui/card";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { TimePickerField } from "@/components/ui/time-picker-field";
import { scheduleMinimumDate } from "@/lib/scheduling-dates";
import type { AvailabilitySlotFormFields } from "@/lib/validation/forms";

interface AvailabilitySlotFormCardProps {
  control: Control<AvailabilitySlotFormFields>;
  onSubmit: () => void;
  submitting: boolean;
  formError: string | null;
  successMessage: string | null;
}

export function AvailabilitySlotFormCard({
  control,
  onSubmit,
  submitting,
  formError,
  successMessage,
}: AvailabilitySlotFormCardProps) {
  return (
    <Card style={{ gap: 12 }}>
      <Text className="text-base font-semibold text-ink">Add open slot</Text>
      <Text className="text-sm text-ink-muted">
        Create one bookable window on your calendar. Patients only see slots when
        you are accepting bookings.
      </Text>

      <Controller
        control={control}
        name="slotDate"
        render={({ field: { onBlur, onChange, value }, fieldState: { error } }) => (
          <DatePickerField
            error={error?.message}
            label="Date"
            minimumDate={scheduleMinimumDate()}
            onBlur={onBlur}
            onChange={onChange}
            value={value}
          />
        )}
      />

      <Controller
        control={control}
        name="startTime"
        render={({ field: { onBlur, onChange, value }, fieldState: { error } }) => (
          <TimePickerField
            error={error?.message}
            label="Start time"
            onBlur={onBlur}
            onChange={onChange}
            value={value}
          />
        )}
      />

      <Controller
        control={control}
        name="endTime"
        render={({ field: { onBlur, onChange, value }, fieldState: { error } }) => (
          <TimePickerField
            error={error?.message}
            label="End time"
            onBlur={onBlur}
            onChange={onChange}
            value={value}
          />
        )}
      />

      {formError ? (
        <Text accessibilityLiveRegion="polite" className="text-sm text-red-600">
          {formError}
        </Text>
      ) : null}
      {successMessage ? (
        <Text accessibilityLiveRegion="polite" className="text-sm text-available">
          {successMessage}
        </Text>
      ) : null}

      <Pressable
        accessibilityLabel="Add open appointment slot"
        accessibilityRole="button"
        accessibilityState={{ disabled: submitting, busy: submitting }}
        className="min-h-12 items-center justify-center rounded-xl bg-primary px-4 web:hover:opacity-90"
        disabled={submitting}
        onPress={onSubmit}
      >
        {submitting ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text className="text-base font-semibold text-surface">Add slot</Text>
        )}
      </Pressable>
    </Card>
  );
}
