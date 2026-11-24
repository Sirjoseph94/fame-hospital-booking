import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm, useWatch } from "react-hook-form";

import { NotificationPreferencesCard } from "@/components/notifications/notification-preferences-card";
import { ShellHeader } from "@/components/shell-header";
import { Card } from "@/components/ui/card";
import { FieldError } from "@/components/ui/field-error";
import { FormTextField } from "@/components/ui/form-text-field";
import { FormTextInput } from "@/components/ui/form-text-input";
import { SchedulingStatePanel } from "@/components/ui/scheduling-state-panel";
import { CardSkeleton, ScreenLoadingSkeleton } from "@/components/ui/skeleton";
import { RefreshErrorNotice } from "@/components/ui/refresh-error-notice";
import {
  useDoctorProfile,
  useUpdateDoctorProfile,
} from "@/lib/queries/profile";
import { useSessionStore } from "@/lib/stores/session";
import { doctorProfileSchema } from "@/lib/validation/profile";
import type { z } from "zod";

function loadErrorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : "Could not load your profile.";
}

export default function DoctorProfileScreen() {
  const session = useSessionStore((state) => state.session);
  const setSession = useSessionStore((state) => state.setSession);
  const userId = session?.userId;
  const [userRefreshing, setUserRefreshing] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const profileQuery = useDoctorProfile(userId);
  const updateProfile = useUpdateDoctorProfile(userId ?? "");
  const profile = profileQuery.data;
  const saving = updateProfile.isPending;

  // Server values for the form; react-hook-form resets to them whenever they
  // change, keeping any fields the user has edited but not saved.
  const formValues = useMemo(
    () =>
      profile
        ? {
            fullName: profile.fullName,
            phone: profile.phone ?? "",
            specialty: profile.specialty,
            bio: profile.bio ?? "",
            yearsExperience: String(profile.yearsExperience),
            consultationFee: String(profile.consultationFee),
          }
        : undefined,
    [profile],
  );

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<
    z.input<typeof doctorProfileSchema>,
    unknown,
    z.output<typeof doctorProfileSchema>
  >({
    resolver: zodResolver(doctorProfileSchema),
    defaultValues: {
      fullName: "",
      phone: "",
      specialty: "",
      bio: "",
      yearsExperience: "0",
      consultationFee: "0",
    },
    values: formValues,
    resetOptions: { keepDirtyValues: true }, // don't wipe unsaved edits on refresh
  });

  const phoneValue = useWatch({ control, name: "phone" });

  const refresh = async () => {
    setUserRefreshing(true);
    try {
      await profileQuery.refetch();
    } finally {
      setUserRefreshing(false);
    }
  };

  const save = async (values: z.infer<typeof doctorProfileSchema>) => {
    if (!session) {
      return;
    }
    setSaveMessage(null);
    try {
      const updated = await updateProfile.mutateAsync({
        fullName: values.fullName,
        phone: values.phone || undefined,
        specialty: values.specialty,
        bio: values.bio || undefined,
        yearsExperience: values.yearsExperience,
        consultationFee: values.consultationFee,
      });
      setSession({
        ...session,
        displayName: updated.fullName,
      });
      setSaveMessage("Profile saved.");
    } catch (cause) {
      setSaveMessage(
        cause instanceof Error ? cause.message : "Could not save profile.",
      );
    }
  };

  return (
    <View className="flex-1 bg-surface-muted">
      <ShellHeader title="Profile" />
      {profileQuery.error && !profile ? (
        <View className="flex-1 justify-center px-4">
          <SchedulingStatePanel
            message={loadErrorMessage(profileQuery.error)}
            onRetry={() => void profileQuery.refetch()}
          />
        </View>
      ) : !profile ? (
        <ScreenLoadingSkeleton>
          <View className="gap-4 px-4">
            <CardSkeleton lines={5} />
          </View>
        </ScreenLoadingSkeleton>
      ) : (
        <ScrollView
          contentContainerClassName="gap-4 px-4 pb-8 pt-2"
          refreshControl={
            <RefreshControl
              refreshing={userRefreshing}
              onRefresh={() => void refresh()}
            />
          }
        >
          <RefreshErrorNotice
            message={profileQuery.error ? loadErrorMessage(profileQuery.error) : null}
          />
          <Card style={{ gap: 12 }}>
            <Text className="text-base font-semibold text-ink">Account</Text>
            <View className="gap-1">
              <Text className="text-sm font-medium text-ink">Email</Text>
              <Text className="text-base text-ink-muted" selectable>
                {profile.email}
              </Text>
            </View>
            <View className="gap-1">
              <Text className="text-sm font-medium text-ink">Department</Text>
              <Text className="text-base text-ink-muted">{profile.department}</Text>
            </View>
            <FormTextField
              compact
              control={control}
              label="Full name"
              name="fullName"
            />
            <FormTextField
              compact
              control={control}
              label="Phone (optional)"
              name="phone"
              accessibilityLabel="Phone number"
              kind="phone"
            />
          </Card>

          {session?.userId ? (
            <NotificationPreferencesCard
              phone={phoneValue}
              userId={session.userId}
            />
          ) : null}

          <Card style={{ gap: 12 }}>
            <Text className="text-base font-semibold text-ink">Practice</Text>
            <FormTextField
              compact
              control={control}
              label="Specialty"
              name="specialty"
            />
            <FormTextField
              compact
              control={control}
              label="Bio (optional)"
              name="bio"
              accessibilityLabel="Professional bio"
              kind="multiline"
            />
            <View className="gap-1">
              <Text className="text-sm font-medium text-ink">Years of experience</Text>
              <Controller
                control={control}
                name="yearsExperience"
                render={({ field: { onBlur, onChange, value } }) => (
                  <FormTextInput
                    accessibilityLabel="Years of experience"
                    kind="number"
                    onBlur={onBlur}
                    onChangeText={(text) => onChange(text.replace(/[^\d]/g, ""))}
                    value={value ?? "0"}
                  />
                )}
              />
              <FieldError message={errors.yearsExperience?.message} />
            </View>
            <View className="gap-1">
              <Text className="text-sm font-medium text-ink">Consultation fee</Text>
              <Controller
                control={control}
                name="consultationFee"
                render={({ field: { onBlur, onChange, value } }) => (
                  <FormTextInput
                    accessibilityLabel="Consultation fee"
                    keyboardType="decimal-pad"
                    onBlur={onBlur}
                    onChangeText={onChange}
                    value={value ?? "0"}
                  />
                )}
              />
              <FieldError message={errors.consultationFee?.message} />
            </View>
          </Card>

          {saveMessage ? (
            <Text accessibilityLiveRegion="polite" className="text-sm text-ink">
              {saveMessage}
            </Text>
          ) : null}

          <Pressable
            accessibilityLabel="Save profile"
            accessibilityRole="button"
            accessibilityState={{ disabled: saving }}
            className="min-h-12 items-center justify-center rounded-xl bg-primary web:hover:opacity-90"
            disabled={saving}
            onPress={() => void handleSubmit(save)()}
          >
            {saving ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text className="font-semibold text-surface">Save profile</Text>
            )}
          </Pressable>
        </ScrollView>
      )}
    </View>
  );
}
