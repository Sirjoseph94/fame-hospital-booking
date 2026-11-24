import { useState } from "react";
import {
  AccessibilityInfo,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { Link, router } from "expo-router";
import { z } from "zod";

import { Card } from "@/components/ui/card";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { FormTextField } from "@/components/ui/form-text-field";
import { GenderSelectField } from "@/components/ui/gender-select-field";
import { authService } from "@/lib/services/auth";
import { useSessionStore } from "@/lib/stores/session";
import { dobDateSchema, genderSchema } from "@/lib/validation/forms";

const signUpSchema = z.object({
  displayName: z.string().trim().min(2, "Enter your full name."),
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(8, "Use at least eight characters."),
  dob: dobDateSchema,
  gender: genderSchema,
});

type SignUpFields = z.infer<typeof signUpSchema>;

export default function SignUpScreen() {
  const setSession = useSessionStore((state) => state.setSession);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<SignUpFields>({
    resolver: zodResolver(signUpSchema),
    defaultValues: {
      displayName: "",
      email: "",
      password: "",
      dob: "",
      gender: undefined,
    },
  });

  const submit = async (values: SignUpFields) => {
    setSubmitError(null);
    setSuccessMessage(null);

    try {
      const session = await authService.signUp(values);
      if (session) {
        setSession(session);
        AccessibilityInfo.announceForAccessibility("Account created.");
        router.replace("/");
        return;
      }

      const message =
        "Account created. Check your email, then return to sign in.";
      setSuccessMessage(message);
      AccessibilityInfo.announceForAccessibility(message);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Account creation failed. Try again.";
      setSubmitError(message);
      AccessibilityInfo.announceForAccessibility(message);
    }
  };

  const dobMaximumDate = new Date();

  return (
    <ScrollView
      className="flex-1 bg-surface-muted"
      contentContainerClassName="min-h-full items-center justify-center px-4 py-10"
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
    >
      <View className="w-full max-w-md gap-5">
        <View className="gap-1">
          <Text className="text-3xl font-bold text-ink">
            Create patient account
          </Text>
          <Text className="text-base text-ink-muted">
            Doctor and admin roles are assigned by hospital staff.
          </Text>
        </View>

        <Card style={{ gap: 16 }}>
          <FormTextField
            control={control}
            label="Full name"
            name="displayName"
            autoComplete="name"
            textContentType="name"
          />

          <FormTextField
            control={control}
            label="Email"
            name="email"
            accessibilityLabel="Email address"
            kind="email"
          />

          <FormTextField
            control={control}
            label="Password"
            name="password"
            autoComplete="new-password"
            kind="password"
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

          {submitError ? (
            <Text accessibilityLiveRegion="assertive" className="text-sm text-ink">
              {submitError}
            </Text>
          ) : null}
          {successMessage ? (
            <Text
              accessibilityLiveRegion="polite"
              className="text-sm text-available"
            >
              {successMessage}
            </Text>
          ) : null}

          <Pressable
            accessibilityLabel="Create patient account"
            accessibilityRole="button"
            accessibilityState={{ busy: isSubmitting, disabled: isSubmitting }}
            className="min-h-12 items-center justify-center rounded-xl bg-primary px-5 web:hover:opacity-90"
            disabled={isSubmitting}
            onPress={() => void handleSubmit(submit)()}
          >
            <Text className="text-base font-semibold text-surface">
              {isSubmitting ? "Creating account…" : "Create account"}
            </Text>
          </Pressable>
        </Card>

        <Link href="/sign-in" asChild>
          <Pressable
            accessibilityLabel="Return to sign in"
            accessibilityRole="link"
            className="min-h-12 items-center justify-center px-4 web:hover:opacity-80"
          >
            <Text className="text-base font-semibold text-primary">
              Return to sign in
            </Text>
          </Pressable>
        </Link>
      </View>
    </ScrollView>
  );
}
