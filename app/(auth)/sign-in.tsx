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
import { FieldError } from "@/components/ui/field-error";
import { FormTextField } from "@/components/ui/form-text-field";
import { FormTextInput } from "@/components/ui/form-text-input";
import { roleHomeRoutes } from "@/lib/role-routes";
import { authService } from "@/lib/services/auth";
import { useSessionStore } from "@/lib/stores/session";

const signInSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

type SignInFields = z.infer<typeof signInSchema>;

export default function SignInScreen() {
  const setSession = useSessionStore((state) => state.setSession);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignInFields>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "", password: "" },
  });

  const submit = async (values: SignInFields) => {
    setSubmitError(null);

    try {
      const session = await authService.signIn(values.email, values.password);
      setSession(session);
      AccessibilityInfo.announceForAccessibility("Signed in successfully.");
      router.replace(roleHomeRoutes[session.role]);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Sign in failed. Try again.";
      setSubmitError(message);
      AccessibilityInfo.announceForAccessibility(message);
    }
  };

  return (
    <ScrollView
      className="flex-1 bg-surface-muted"
      contentContainerClassName="min-h-full items-center justify-center px-4 py-10"
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
    >
      <View className="w-full max-w-md gap-5">
        <View className="gap-1">
          <Text className="text-3xl font-bold text-ink">Welcome back</Text>
          <Text className="text-base text-ink-muted">
            Sign in with your hospital account.
          </Text>
        </View>

        <Card style={{ gap: 16 }}>
          <FormTextField
            control={control}
            label="Email"
            name="email"
            accessibilityLabel="Email address"
            kind="email"
          />

          <View className="gap-2">
            <Text className="font-medium text-ink">Password</Text>
            <Controller
              control={control}
              name="password"
              render={({ field: { onBlur, onChange, value } }) => (
                <FormTextInput
                  accessibilityLabel="Password"
                  autoComplete="current-password"
                  kind="password"
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                />
              )}
            />
            <FieldError message={errors.password?.message} />
            <Link href="/forgot-password" asChild>
              <Pressable
                accessibilityLabel="Forgot password"
                accessibilityRole="link"
                className="self-start py-1 web:hover:opacity-80"
              >
                <Text className="text-sm font-semibold text-primary">
                  Forgot password?
                </Text>
              </Pressable>
            </Link>
          </View>

          {submitError ? (
            <Text accessibilityLiveRegion="assertive" className="text-sm text-ink">
              {submitError}
            </Text>
          ) : null}

          <Pressable
            accessibilityLabel="Sign in"
            accessibilityRole="button"
            accessibilityState={{ busy: isSubmitting, disabled: isSubmitting }}
            className="min-h-12 items-center justify-center rounded-xl bg-primary px-5 web:hover:opacity-90"
            disabled={isSubmitting}
            onPress={() => void handleSubmit(submit)()}
          >
            <Text className="text-base font-semibold text-surface">
              {isSubmitting ? "Signing in…" : "Sign in"}
            </Text>
          </Pressable>
        </Card>

        <Link href="/sign-up" asChild>
          <Pressable
            accessibilityLabel="Create a patient account"
            accessibilityRole="link"
            className="min-h-12 items-center justify-center px-4 web:hover:opacity-80"
          >
            <Text className="text-base font-semibold text-primary">
              Create a patient account
            </Text>
          </Pressable>
        </Link>
      </View>
    </ScrollView>
  );
}
