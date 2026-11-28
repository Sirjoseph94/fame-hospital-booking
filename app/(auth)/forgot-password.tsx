import { useState } from "react";
import {
  AccessibilityInfo,
  Pressable,
  Text,
  View,
} from "react-native";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Link } from "expo-router";
import { z } from "zod";

import { PageScrollView } from "@/components/ui/page-scroll-view";
import { Card } from "@/components/ui/card";
import { FormTextField } from "@/components/ui/form-text-field";
import { authService } from "@/lib/services/auth";

const forgotPasswordSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
});

type ForgotPasswordFields = z.infer<typeof forgotPasswordSchema>;

export default function ForgotPasswordScreen() {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const {
    control,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<ForgotPasswordFields>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  const submit = async (values: ForgotPasswordFields) => {
    setSubmitError(null);

    try {
      await authService.requestPasswordReset(values.email);
      setSent(true);
      AccessibilityInfo.announceForAccessibility(
        "If an account exists for that email, password reset instructions were sent.",
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Could not send reset email. Try again.";
      setSubmitError(message);
      AccessibilityInfo.announceForAccessibility(message);
    }
  };

  return (
    <PageScrollView
      className="flex-1 bg-surface-muted"
      contentContainerClassName="min-h-full items-center justify-center px-4 py-10"
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
    >
      <View className="w-full max-w-md gap-5">
        <View className="gap-1">
          <Text className="text-3xl font-bold text-ink">Reset password</Text>
          <Text className="text-base text-ink-muted">
            Enter the email for your hospital account. We will send a link to
            choose a new password.
          </Text>
        </View>

        <Card style={{ gap: 16 }}>
          {sent ? (
            <View className="gap-3">
              <Text accessibilityLiveRegion="polite" className="text-base text-ink">
                If an account exists for that email, you will receive reset
                instructions shortly. Open the link on this device, then return
                here to sign in with your new password.
              </Text>
              <Link href="/sign-in" asChild>
                <Pressable
                  accessibilityLabel="Back to sign in"
                  accessibilityRole="link"
                  className="min-h-12 items-center justify-center rounded-xl bg-primary px-5 web:hover:opacity-90"
                >
                  <Text className="text-base font-semibold text-surface">
                    Back to sign in
                  </Text>
                </Pressable>
              </Link>
            </View>
          ) : (
            <>
              <FormTextField
                control={control}
                label="Email"
                name="email"
                accessibilityLabel="Email address"
                kind="email"
              />

              {submitError ? (
                <Text
                  accessibilityLiveRegion="assertive"
                  className="text-sm text-ink"
                >
                  {submitError}
                </Text>
              ) : null}

              <Pressable
                accessibilityLabel="Send password reset email"
                accessibilityRole="button"
                accessibilityState={{ busy: isSubmitting, disabled: isSubmitting }}
                className="min-h-12 items-center justify-center rounded-xl bg-primary px-5 web:hover:opacity-90"
                disabled={isSubmitting}
                onPress={() => void handleSubmit(submit)()}
              >
                <Text className="text-base font-semibold text-surface">
                  {isSubmitting ? "Sending…" : "Send reset link"}
                </Text>
              </Pressable>
            </>
          )}
        </Card>

        {!sent ? (
          <Link href="/sign-in" asChild>
            <Pressable
              accessibilityLabel="Back to sign in"
              accessibilityRole="link"
              className="min-h-12 items-center justify-center px-4 web:hover:opacity-80"
            >
              <Text className="text-base font-semibold text-primary">
                Back to sign in
              </Text>
            </Pressable>
          </Link>
        ) : null}
      </View>
    </PageScrollView>
  );
}
