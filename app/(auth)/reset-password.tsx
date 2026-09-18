import { useEffect, useState } from "react";
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
import { FormTextInput } from "@/components/ui/form-text-input";
import { authService } from "@/lib/services/auth";
import { supabase } from "@/lib/supabase";
import { useSessionStore } from "@/lib/stores/session";

const resetPasswordSchema = z
  .object({
    password: z.string().min(8, "Use at least eight characters."),
    confirmPassword: z.string().min(1, "Confirm your new password."),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

type ResetPasswordFields = z.infer<typeof resetPasswordSchema>;

export default function ResetPasswordScreen() {
  const setSession = useSessionStore((state) => state.setSession);
  const [ready, setReady] = useState(false);
  const [hasRecoverySession, setHasRecoverySession] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordFields>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  useEffect(() => {
    let mounted = true;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) {
        return;
      }
      if (event === "PASSWORD_RECOVERY" || session) {
        setHasRecoverySession(Boolean(session));
        setReady(true);
      }
    });

    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) {
        return;
      }
      setHasRecoverySession(Boolean(session));
      setReady(true);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const submit = async (values: ResetPasswordFields) => {
    setSubmitError(null);

    try {
      await authService.updatePassword(values.password);
      await authService.signOut();
      setSession(null);
      AccessibilityInfo.announceForAccessibility(
        "Password updated. Sign in with your new password.",
      );
      router.replace("/sign-in");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Could not update password. Try again.";
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
          <Text className="text-3xl font-bold text-ink">Choose new password</Text>
          <Text className="text-base text-ink-muted">
            Set a new password for your hospital account.
          </Text>
        </View>

        <Card style={{ gap: 16 }}>
          {!ready ? (
            <Text accessibilityLiveRegion="polite" className="text-base text-ink-muted">
              Verifying reset link…
            </Text>
          ) : !hasRecoverySession ? (
            <View className="gap-3">
              <Text accessibilityLiveRegion="polite" className="text-base text-ink">
                This reset link is missing or expired. Request a new one from
                the sign-in screen.
              </Text>
              <Link href="/forgot-password" asChild>
                <Pressable
                  accessibilityLabel="Request a new reset link"
                  accessibilityRole="link"
                  className="min-h-12 items-center justify-center rounded-xl bg-primary px-5 web:hover:opacity-90"
                >
                  <Text className="text-base font-semibold text-surface">
                    Request reset link
                  </Text>
                </Pressable>
              </Link>
            </View>
          ) : (
            <>
              <View className="gap-2">
                <Text className="font-medium text-ink">New password</Text>
                <Controller
                  control={control}
                  name="password"
                  render={({ field: { onBlur, onChange, value } }) => (
                    <FormTextInput
                      accessibilityLabel="New password"
                      autoComplete="new-password"
                      kind="password"
                      onBlur={onBlur}
                      onChangeText={onChange}
                      value={value}
                    />
                  )}
                />
                <FieldError message={errors.password?.message} />
              </View>

              <View className="gap-2">
                <Text className="font-medium text-ink">Confirm password</Text>
                <Controller
                  control={control}
                  name="confirmPassword"
                  render={({ field: { onBlur, onChange, value } }) => (
                    <FormTextInput
                      accessibilityLabel="Confirm new password"
                      autoComplete="new-password"
                      kind="password"
                      onBlur={onBlur}
                      onChangeText={onChange}
                      value={value}
                    />
                  )}
                />
                <FieldError message={errors.confirmPassword?.message} />
              </View>

              {submitError ? (
                <Text
                  accessibilityLiveRegion="assertive"
                  className="text-sm text-ink"
                >
                  {submitError}
                </Text>
              ) : null}

              <Pressable
                accessibilityLabel="Save new password"
                accessibilityRole="button"
                accessibilityState={{ busy: isSubmitting, disabled: isSubmitting }}
                className="min-h-12 items-center justify-center rounded-xl bg-primary px-5 web:hover:opacity-90"
                disabled={isSubmitting}
                onPress={() => void handleSubmit(submit)()}
              >
                <Text className="text-base font-semibold text-surface">
                  {isSubmitting ? "Saving…" : "Save password"}
                </Text>
              </Pressable>
            </>
          )}
        </Card>
      </View>
    </ScrollView>
  );
}
