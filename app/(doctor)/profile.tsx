import { useCallback, useEffect, useState } from "react";
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
import { FormTextInput } from "@/components/ui/form-text-input";
import { SchedulingStatePanel } from "@/components/ui/scheduling-state-panel";
import { CardSkeleton, ScreenLoadingSkeleton } from "@/components/ui/skeleton";
import { profileService } from "@/lib/services/profile";
import { useSessionStore } from "@/lib/stores/session";
import { doctorProfileSchema } from "@/lib/validation/profile";
import type { z } from "zod";

export default function DoctorProfileScreen() {
  const session = useSessionStore((state) => state.session);
  const setSession = useSessionStore((state) => state.setSession);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [department, setDepartment] = useState("");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    reset,
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
  });

  const phoneValue = useWatch({ control, name: "phone" });

  const userId = session?.userId;

  const load = useCallback(async () => {
    if (!userId) {
      return;
    }
    setError(null);
    try {
      const profile = await profileService.getDoctorProfile(userId);
      setEmail(profile.email);
      setDepartment(profile.department);
      reset({
        fullName: profile.fullName,
        phone: profile.phone ?? "",
        specialty: profile.specialty,
        bio: profile.bio ?? "",
        yearsExperience: String(profile.yearsExperience),
        consultationFee: String(profile.consultationFee),
      }, { keepDirtyValues: true }); // don't wipe unsaved edits on refresh
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not load your profile.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [reset, userId]);

  useEffect(() => {
    const task = setTimeout(() => void load(), 0);
    return () => clearTimeout(task);
  }, [load]);

  const save = async (values: z.infer<typeof doctorProfileSchema>) => {
    if (!session) {
      return;
    }
    setSaving(true);
    setSaveMessage(null);
    try {
      const updated = await profileService.updateDoctorProfile(session.userId, {
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
    } finally {
      setSaving(false);
    }
  };

  return (
    <View className="flex-1 bg-surface-muted">
      <ShellHeader title="Profile" />
      {loading ? (
        <ScreenLoadingSkeleton>
          <View className="gap-4 px-4">
            <CardSkeleton lines={5} />
          </View>
        </ScreenLoadingSkeleton>
      ) : error ? (
        <View className="flex-1 justify-center px-4">
          <SchedulingStatePanel message={error} onRetry={() => void load()} />
        </View>
      ) : (
        <ScrollView
          contentContainerClassName="gap-4 px-4 pb-8 pt-2"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void load();
              }}
            />
          }
        >
          <Card style={{ gap: 12 }}>
            <Text className="text-base font-semibold text-ink">Account</Text>
            <View className="gap-1">
              <Text className="text-sm font-medium text-ink">Email</Text>
              <Text className="text-base text-ink-muted" selectable>
                {email}
              </Text>
            </View>
            <View className="gap-1">
              <Text className="text-sm font-medium text-ink">Department</Text>
              <Text className="text-base text-ink-muted">{department}</Text>
            </View>
            <View className="gap-1">
              <Text className="text-sm font-medium text-ink">Full name</Text>
              <Controller
                control={control}
                name="fullName"
                render={({ field: { onBlur, onChange, value } }) => (
                  <FormTextInput
                    accessibilityLabel="Full name"
                    onBlur={onBlur}
                    onChangeText={onChange}
                    value={value}
                  />
                )}
              />
              <FieldError message={errors.fullName?.message} />
            </View>
            <View className="gap-1">
              <Text className="text-sm font-medium text-ink">Phone (optional)</Text>
              <Controller
                control={control}
                name="phone"
                render={({ field: { onBlur, onChange, value } }) => (
                  <FormTextInput
                    accessibilityLabel="Phone number"
                    kind="phone"
                    onBlur={onBlur}
                    onChangeText={onChange}
                    value={value ?? ""}
                  />
                )}
              />
              <FieldError message={errors.phone?.message} />
            </View>
          </Card>

          {session?.userId ? (
            <NotificationPreferencesCard
              phone={phoneValue}
              userId={session.userId}
            />
          ) : null}

          <Card style={{ gap: 12 }}>
            <Text className="text-base font-semibold text-ink">Practice</Text>
            <View className="gap-1">
              <Text className="text-sm font-medium text-ink">Specialty</Text>
              <Controller
                control={control}
                name="specialty"
                render={({ field: { onBlur, onChange, value } }) => (
                  <FormTextInput
                    accessibilityLabel="Specialty"
                    onBlur={onBlur}
                    onChangeText={onChange}
                    value={value}
                  />
                )}
              />
              <FieldError message={errors.specialty?.message} />
            </View>
            <View className="gap-1">
              <Text className="text-sm font-medium text-ink">Bio (optional)</Text>
              <Controller
                control={control}
                name="bio"
                render={({ field: { onBlur, onChange, value } }) => (
                  <FormTextInput
                    accessibilityLabel="Professional bio"
                    kind="multiline"
                    onBlur={onBlur}
                    onChangeText={onChange}
                    value={value ?? ""}
                  />
                )}
              />
              <FieldError message={errors.bio?.message} />
            </View>
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
