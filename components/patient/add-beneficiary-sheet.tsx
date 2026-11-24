import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { Pressable, Text, View } from "react-native";
import { z } from "zod";

import { Sheet } from "@/components/ui/sheet";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { FieldError } from "@/components/ui/field-error";
import { FormTextField } from "@/components/ui/form-text-field";
import { FormTextInput } from "@/components/ui/form-text-input";
import { GenderSelectField } from "@/components/ui/gender-select-field";
import { dobDateSchema, genderSchema } from "@/lib/validation/forms";
import type { BeneficiaryRelationship } from "@/types/scheduling";

const schema = z.object({
  displayName: z.string().trim().min(2, "Enter a name."),
  relationship: z.enum(["child", "parent", "spouse", "other"]),
  dob: dobDateSchema,
  gender: genderSchema,
  nationalId: z.string().trim().optional(),
  hospitalFileId: z.string().trim().optional(),
});

export type AddBeneficiaryFields = z.infer<typeof schema>;

interface AddBeneficiarySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Resolve `false` on failure to keep the form draft. */
  onSubmit: (values: AddBeneficiaryFields) => Promise<boolean | void>;
  submitting: boolean;
  errorMessage: string | null;
}

export function AddBeneficiarySheet({
  open,
  onOpenChange,
  onSubmit,
  submitting,
  errorMessage,
}: AddBeneficiarySheetProps) {
  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<AddBeneficiaryFields>({
    resolver: zodResolver(schema),
    defaultValues: {
      displayName: "",
      relationship: "child",
      dob: "",
      gender: undefined,
      nationalId: "",
      hospitalFileId: "",
    },
  });

  const submit = async (values: AddBeneficiaryFields) => {
    const saved = await onSubmit(values);
    if (saved !== false) {
      reset();
    }
  };

  const dobMaximumDate = new Date();

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Add new patient"
      accessibilityLabel="Add beneficiary form"
    >
      <View className="gap-3">
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

        <FormTextField
          compact
          control={control}
          label="National ID (optional)"
          name="nationalId"
          accessibilityLabel="National ID"
          autoCapitalize="characters"
        />

        <View className="gap-1">
          <Text className="text-sm font-medium text-ink">
            Hospital file ID (optional)
          </Text>
          <Controller
            control={control}
            name="hospitalFileId"
            render={({ field: { onBlur, onChange, value } }) => (
              <FormTextInput
                accessibilityLabel="Hospital file ID"
                autoCapitalize="characters"
                onBlur={onBlur}
                onChangeText={onChange}
                value={value ?? ""}
              />
            )}
          />
        </View>

        <View className="gap-1">
          <Text className="text-sm font-medium text-ink">Relationship</Text>
          <Controller
            control={control}
            name="relationship"
            render={({ field: { onChange, value } }) => (
              <View className="flex-row flex-wrap gap-2">
                {(["child", "parent", "spouse", "other"] as BeneficiaryRelationship[]).map(
                  (relationship) => (
                    <Pressable
                      key={relationship}
                      accessibilityLabel={relationship}
                      accessibilityRole="button"
                      accessibilityState={{ selected: value === relationship }}
                      className={[
                        "min-h-12 justify-center rounded-full border px-4 py-3 web:hover:opacity-90",
                        value === relationship
                          ? "border-primary bg-primary"
                          : "border-ink-muted bg-surface",
                      ].join(" ")}
                      onPress={() => onChange(relationship)}
                    >
                      <Text
                        className={[
                          "text-base capitalize",
                          value === relationship ? "text-surface" : "text-ink",
                        ].join(" ")}
                      >
                        {relationship}
                      </Text>
                    </Pressable>
                  ),
                )}
              </View>
            )}
          />
          <FieldError message={errors.relationship?.message} />
        </View>

        {errorMessage ? (
          <Text accessibilityLiveRegion="assertive" className="text-sm text-ink">
            {errorMessage}
          </Text>
        ) : null}

        <Pressable
          accessibilityLabel="Save patient"
          accessibilityRole="button"
          accessibilityState={{ busy: submitting, disabled: submitting }}
          className="min-h-12 items-center justify-center rounded-xl bg-primary px-4 web:hover:opacity-90"
          disabled={submitting}
          onPress={() => void handleSubmit(submit)()}
        >
          <Text className="text-base font-semibold text-surface">
            {submitting ? "Saving…" : "Save patient"}
          </Text>
        </Pressable>
      </View>
    </Sheet>
  );
}
