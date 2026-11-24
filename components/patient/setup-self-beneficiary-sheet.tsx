import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { Pressable, Text, View } from "react-native";
import { z } from "zod";

import { Sheet } from "@/components/ui/sheet";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { FormTextField } from "@/components/ui/form-text-field";
import { GenderSelectField } from "@/components/ui/gender-select-field";
import { dobDateSchema, genderSchema } from "@/lib/validation/forms";

const schema = z.object({
  displayName: z.string().trim().min(2, "Enter your name."),
  dob: dobDateSchema,
  gender: genderSchema,
});

export type SetupSelfBeneficiaryFields = z.infer<typeof schema>;

interface SetupSelfBeneficiarySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultDisplayName?: string;
  onSubmit: (values: SetupSelfBeneficiaryFields) => Promise<void>;
  submitting: boolean;
  errorMessage: string | null;
}

export function SetupSelfBeneficiarySheet({
  open,
  onOpenChange,
  defaultDisplayName = "",
  onSubmit,
  submitting,
  errorMessage,
}: SetupSelfBeneficiarySheetProps) {
  const {
    control,
    handleSubmit,
    reset,
  } = useForm<SetupSelfBeneficiaryFields>({
    resolver: zodResolver(schema),
    defaultValues: {
      displayName: defaultDisplayName,
      dob: "",
      gender: undefined,
    },
  });

  useEffect(() => {
    if (open) {
      reset({
        displayName: defaultDisplayName,
        dob: "",
        gender: undefined,
      });
    }
  }, [defaultDisplayName, open, reset]);

  const submit = async (values: SetupSelfBeneficiaryFields) => {
    await onSubmit(values);
    reset();
  };

  const dobMaximumDate = new Date();

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Book for myself"
      accessibilityLabel="Set up your patient profile"
    >
      <View className="gap-3">
        <Text className="text-sm text-ink-muted">
          We use this as your default when booking appointments. You can add
          dependents later.
        </Text>

        <FormTextField
          compact
          control={control}
          label="Full name"
          name="displayName"
        />

        <Controller
          control={control}
          name="dob"
          render={({ field: { onBlur, onChange, value }, fieldState: { error } }) => (
            <DatePickerField
              error={error?.message}
              label="Date of birth"
              maximumDate={dobMaximumDate}
              onBlur={onBlur}
              onChange={onChange}
              value={value}
            />
          )}
        />

        <Controller
          control={control}
          name="gender"
          render={({ field: { onChange, value }, fieldState: { error } }) => (
            <GenderSelectField
              error={error?.message}
              onChange={onChange}
              value={value ?? ""}
            />
          )}
        />

        {errorMessage ? (
          <Text accessibilityLiveRegion="assertive" className="text-sm text-ink">
            {errorMessage}
          </Text>
        ) : null}

        <Pressable
          accessibilityLabel="Save and book for myself"
          accessibilityRole="button"
          accessibilityState={{ busy: submitting, disabled: submitting }}
          className="min-h-12 items-center justify-center rounded-xl bg-primary px-4 web:hover:opacity-90"
          disabled={submitting}
          onPress={() => void handleSubmit(submit)()}
        >
          <Text className="text-base font-semibold text-surface">
            {submitting ? "Saving…" : "Save and use for booking"}
          </Text>
        </Pressable>
      </View>
    </Sheet>
  );
}
