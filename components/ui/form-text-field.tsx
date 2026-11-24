import { Text, View } from "react-native";
import {
  useController,
  type Control,
  type FieldPath,
  type FieldValues,
} from "react-hook-form";

import { FieldError } from "@/components/ui/field-error";
import {
  FormTextInput,
  type FormTextInputProps,
} from "@/components/ui/form-text-input";

type FormTextFieldProps<T extends FieldValues> = Omit<
  FormTextInputProps,
  "value" | "onChangeText" | "onBlur"
> & {
  // Context / transformed-output types vary per form (e.g. zod schemas that
  // coerce strings to numbers); this field only reads and writes the input.
  control: Control<T, any, any>;
  name: FieldPath<T>;
  label: string;
  /** Tighter spacing + small label (profile screens, sheets). */
  compact?: boolean;
};

/**
 * Label + text input + validation message for a react-hook-form string field.
 * `accessibilityLabel` defaults to the visible label.
 */
export function FormTextField<T extends FieldValues>({
  control,
  name,
  label,
  compact = false,
  accessibilityLabel,
  ...inputProps
}: FormTextFieldProps<T>) {
  const { field, fieldState } = useController({ control, name });

  return (
    <View className={compact ? "gap-1" : "gap-2"}>
      <Text
        className={compact ? "text-sm font-medium text-ink" : "font-medium text-ink"}
      >
        {label}
      </Text>
      <FormTextInput
        accessibilityLabel={accessibilityLabel ?? label}
        onBlur={field.onBlur}
        onChangeText={field.onChange}
        value={field.value ?? ""}
        {...inputProps}
      />
      <FieldError message={fieldState.error?.message} />
    </View>
  );
}
