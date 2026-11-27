import { ActivityIndicator, Pressable, Switch, Text, View } from "react-native";
import { Controller, useWatch, type Control } from "react-hook-form";

import { Card } from "@/components/ui/card";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { FieldError } from "@/components/ui/field-error";
import { FormTextInput } from "@/components/ui/form-text-input";
import { TimePickerField } from "@/components/ui/time-picker-field";
import { scheduleMinimumDate } from "@/lib/scheduling-dates";
import { colors } from "@/lib/theme-colors";
import type { ClinicSessionFormFields } from "@/lib/validation/forms";

/** Monday-first, values are JS getDay() numbers. */
const WEEKDAYS = [
  { value: 1, short: "Mon", label: "Monday" },
  { value: 2, short: "Tue", label: "Tuesday" },
  { value: 3, short: "Wed", label: "Wednesday" },
  { value: 4, short: "Thu", label: "Thursday" },
  { value: 5, short: "Fri", label: "Friday" },
  { value: 6, short: "Sat", label: "Saturday" },
  { value: 0, short: "Sun", label: "Sunday" },
] as const;

interface SessionFormCardProps {
  control: Control<ClinicSessionFormFields>;
  onSubmit: () => void;
  submitting: boolean;
  formError: string | null;
  successMessage: string | null;
}

export function SessionFormCard({
  control,
  onSubmit,
  submitting,
  formError,
  successMessage,
}: SessionFormCardProps) {
  const repeatWeekly = useWatch({ control, name: "repeatWeekly" });

  return (
    <Card style={{ gap: 12 }}>
      <Text className="text-base font-semibold text-ink">Add clinic sessions</Text>
      <Text className="text-sm text-ink-muted">
        Patients book a place in a session and are seen in order of arrival.
        The patient limit caps how many can book.
      </Text>

      <Controller
        control={control}
        name="firstDate"
        render={({ field: { onBlur, onChange, value }, fieldState: { error } }) => (
          <DatePickerField
            error={error?.message}
            label={repeatWeekly ? "Starting from" : "Date"}
            minimumDate={scheduleMinimumDate()}
            onBlur={onBlur}
            onChange={onChange}
            value={value}
          />
        )}
      />

      <View className="flex-row gap-3">
        <View className="min-w-0 flex-1">
          <Controller
            control={control}
            name="startTime"
            render={({ field: { onBlur, onChange, value }, fieldState: { error } }) => (
              <TimePickerField
                error={error?.message}
                label="Starts"
                onBlur={onBlur}
                onChange={onChange}
                value={value}
              />
            )}
          />
        </View>
        <View className="min-w-0 flex-1">
          <Controller
            control={control}
            name="endTime"
            render={({ field: { onBlur, onChange, value }, fieldState: { error } }) => (
              <TimePickerField
                error={error?.message}
                label="Ends"
                onBlur={onBlur}
                onChange={onChange}
                value={value}
              />
            )}
          />
        </View>
      </View>

      <Controller
        control={control}
        name="capacity"
        render={({ field: { onBlur, onChange, value }, fieldState: { error } }) => (
          <View className="gap-1">
            <Text className="text-sm font-medium text-ink">Patient limit</Text>
            <FormTextInput
              accessibilityLabel="Maximum number of patients"
              kind="number"
              maxLength={3}
              onBlur={onBlur}
              onChangeText={onChange}
              value={value}
            />
            <FieldError message={error?.message} />
          </View>
        )}
      />

      <Controller
        control={control}
        name="repeatWeekly"
        render={({ field: { onChange, value } }) => (
          <View className="min-h-12 flex-row items-center justify-between gap-3">
            <Text className="text-sm font-medium text-ink">Repeat every week</Text>
            <Switch
              accessibilityLabel="Repeat every week"
              onValueChange={onChange}
              thumbColor={colors.surface}
              trackColor={{ false: colors["ink-muted"], true: colors.primary }}
              value={value}
            />
          </View>
        )}
      />

      {repeatWeekly ? (
        <>
          <Controller
            control={control}
            name="weekdays"
            render={({ field: { onChange, value }, fieldState: { error } }) => (
              <View className="gap-2">
                <Text className="text-sm font-medium text-ink">On these days</Text>
                <View className="flex-row flex-wrap gap-2">
                  {WEEKDAYS.map((day) => {
                    const selected = value.includes(day.value);
                    return (
                      <Pressable
                        key={day.value}
                        accessibilityLabel={day.label}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: selected }}
                        className={[
                          "min-h-11 min-w-12 items-center justify-center rounded-xl border px-3",
                          selected ? "border-primary bg-primary" : "border-ink-muted bg-surface",
                        ].join(" ")}
                        onPress={() =>
                          onChange(
                            selected
                              ? value.filter((entry) => entry !== day.value)
                              : [...value, day.value],
                          )
                        }
                      >
                        <Text
                          className={`text-sm font-semibold ${selected ? "text-surface" : "text-ink"}`}
                        >
                          {day.short}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <FieldError message={error?.message} />
              </View>
            )}
          />
          <Controller
            control={control}
            name="weeks"
            render={({ field: { onBlur, onChange, value }, fieldState: { error } }) => (
              <View className="gap-1">
                <Text className="text-sm font-medium text-ink">For how many weeks</Text>
                <FormTextInput
                  accessibilityLabel="Number of weeks"
                  kind="number"
                  maxLength={2}
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                />
                <FieldError message={error?.message} />
              </View>
            )}
          />
        </>
      ) : null}

      {formError ? (
        <Text accessibilityLiveRegion="polite" className="text-sm text-danger">
          {formError}
        </Text>
      ) : null}
      {successMessage ? (
        <Text accessibilityLiveRegion="polite" className="text-sm text-available">
          {successMessage}
        </Text>
      ) : null}

      <Pressable
        accessibilityLabel={repeatWeekly ? "Add weekly sessions" : "Add session"}
        accessibilityRole="button"
        accessibilityState={{ disabled: submitting, busy: submitting }}
        className="min-h-12 items-center justify-center rounded-xl bg-primary px-4 web:hover:opacity-90"
        disabled={submitting}
        onPress={onSubmit}
      >
        {submitting ? (
          <ActivityIndicator color={colors.surface} />
        ) : (
          <Text className="text-base font-semibold text-surface">
            {repeatWeekly ? "Add weekly sessions" : "Add session"}
          </Text>
        )}
      </Pressable>
    </Card>
  );
}
