import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Controller, type Control } from "react-hook-form";

import { Card } from "@/components/ui/card";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { FormTextInput } from "@/components/ui/form-text-input";
import { TimePickerField } from "@/components/ui/time-picker-field";
import { scheduleMinimumDate } from "@/lib/scheduling-dates";
import type { BlackoutFormFields } from "@/lib/validation/forms";

interface BlackoutFormCardProps {
  control: Control<BlackoutFormFields>;
  onSubmit: () => void;
  submitting: boolean;
  formError: string | null;
  successMessage: string | null;
  warningMessage?: string | null;
  submitLabel?: string;
  intro?: string;
}

export function BlackoutFormCard({
  control,
  onSubmit,
  submitting,
  formError,
  successMessage,
  warningMessage,
  submitLabel = "Save blackout",
  intro = "Block a single period when appointments cannot be booked.",
}: BlackoutFormCardProps) {
  return (
    <Card style={{ gap: 12 }}>
      <Text className="text-base font-semibold text-ink">Add blackout</Text>
      <Text className="text-sm text-ink-muted">{intro}</Text>

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

      <Controller
        control={control}
        name="reason"
        render={({ field: { onBlur, onChange, value }, fieldState: { error } }) => (
          <View className="gap-1">
            <Text className="text-sm font-medium text-ink">Reason</Text>
            <FormTextInput
              accessibilityLabel="Blackout reason"
              onBlur={onBlur}
              onChangeText={onChange}
              value={value}
            />
            {error?.message ? (
              <Text accessibilityLiveRegion="polite" className="text-sm text-ink">
                {error.message}
              </Text>
            ) : null}
          </View>
        )}
      />

      {formError ? (
        <Text accessibilityLiveRegion="assertive" className="text-sm text-ink">
          {formError}
        </Text>
      ) : null}

      {successMessage ? (
        <Text accessibilityLiveRegion="polite" className="text-sm text-available">
          {successMessage}
        </Text>
      ) : null}

      {warningMessage ? (
        <Text accessibilityLiveRegion="polite" className="text-sm font-medium text-warning">
          {warningMessage}
        </Text>
      ) : null}

      <Pressable
        accessibilityLabel={submitLabel}
        accessibilityRole="button"
        accessibilityState={{ disabled: submitting }}
        className="min-h-12 items-center justify-center rounded-xl bg-primary web:hover:opacity-90"
        disabled={submitting}
        onPress={onSubmit}
      >
        {submitting ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text className="font-semibold text-surface">{submitLabel}</Text>
        )}
      </Pressable>
    </Card>
  );
}
