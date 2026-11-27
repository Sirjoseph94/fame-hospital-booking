import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, router } from "expo-router";
import { Controller, useForm, useWatch } from "react-hook-form";

import { NotificationPreferencesCard } from "@/components/notifications/notification-preferences-card";
import { RefreshErrorNotice } from "@/components/ui/refresh-error-notice";
import { ShellHeader } from "@/components/shell-header";
import { Card } from "@/components/ui/card";
import { FieldError } from "@/components/ui/field-error";
import { FormTextField } from "@/components/ui/form-text-field";
import { FormTextInput } from "@/components/ui/form-text-input";
import { SchedulingStatePanel } from "@/components/ui/scheduling-state-panel";
import { CardSkeleton, ScreenLoadingSkeleton } from "@/components/ui/skeleton";
import { useClaimDoctorInvite } from "@/lib/queries/invites";
import {
  usePatientProfile,
  useUpdatePatientProfile,
} from "@/lib/queries/profile";
import { authService } from "@/lib/services/auth";
import { InviteError } from "@/lib/services/invites";
import { useSessionStore } from "@/lib/stores/session";
import {
  doctorClaimCodeSchema,
  type DoctorClaimCodeFields,
} from "@/lib/validation/invites";
import {
  patientProfileSchema,
  type PatientProfileFormFields,
} from "@/lib/validation/profile";

function optionalField(value: string | undefined): string {
  return value ?? "";
}

function profileErrorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : "Could not load your profile.";
}

export default function PatientProfileScreen() {
  const session = useSessionStore((state) => state.session);
  const setSession = useSessionStore((state) => state.setSession);
  const userId = session?.userId;
  const profileQuery = usePatientProfile(userId);
  const updateProfile = useUpdatePatientProfile(userId ?? "");
  const claimDoctorInvite = useClaimDoctorInvite();
  const [userRefreshing, setUserRefreshing] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [refreshingSession, setRefreshingSession] = useState(false);
  const saving = updateProfile.isPending;
  const claiming = claimDoctorInvite.isPending || refreshingSession;
  const [claimMessage, setClaimMessage] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PatientProfileFormFields>({
    resolver: zodResolver(patientProfileSchema),
    defaultValues: {
      fullName: "",
      phone: "",
      emergencyContactName: "",
      emergencyContactPhone: "",
      address: "",
      bloodType: "",
      allergies: "",
      medications: "",
      medicalConditions: "",
      medicalNotes: "",
    },
  });

  const {
    control: claimControl,
    handleSubmit: handleClaimSubmit,
    formState: { errors: claimErrors },
  } = useForm<DoctorClaimCodeFields>({
    resolver: zodResolver(doctorClaimCodeSchema),
    defaultValues: { code: "" },
  });

  const phoneValue = useWatch({ control, name: "phone" });

  const profile = profileQuery.data;
  const email = profile?.email ?? "";
  const initialLoading = profile === undefined && profileQuery.isPending;
  const blockingError =
    profileQuery.isError && profile === undefined ? profileQuery.error : null;
  const refreshError = profileQuery.isError ? profileQuery.error : null;

  // Reset the form whenever fresh profile data arrives.
  useEffect(() => {
    if (!profile) {
      return;
    }
    reset({
      fullName: profile.fullName,
      phone: optionalField(profile.phone),
      emergencyContactName: optionalField(profile.emergencyContactName),
      emergencyContactPhone: optionalField(profile.emergencyContactPhone),
      address: optionalField(profile.address),
      bloodType: optionalField(profile.bloodType),
      allergies: optionalField(profile.allergies),
      medications: optionalField(profile.medications),
      medicalConditions: optionalField(profile.medicalConditions),
      medicalNotes: optionalField(profile.medicalNotes),
    }, { keepDirtyValues: true }); // don't wipe unsaved edits on refresh
  }, [profile, reset]);

  const onPullToRefresh = async () => {
    setUserRefreshing(true);
    try {
      await profileQuery.refetch();
    } finally {
      setUserRefreshing(false);
    }
  };

  const save = async (values: PatientProfileFormFields) => {
    if (!session) {
      return;
    }
    if (updateProfile.isPending) {
      return;
    }
    setSaveMessage(null);
    try {
      const updated = await updateProfile.mutateAsync({
        fullName: values.fullName,
        phone: values.phone || undefined,
        emergencyContactName: values.emergencyContactName || undefined,
        emergencyContactPhone: values.emergencyContactPhone || undefined,
        address: values.address || undefined,
        bloodType: values.bloodType || undefined,
        allergies: values.allergies || undefined,
        medications: values.medications || undefined,
        medicalConditions: values.medicalConditions || undefined,
        medicalNotes: values.medicalNotes || undefined,
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

  const claimInvite = async (values: DoctorClaimCodeFields) => {
    if (claiming) {
      return;
    }
    setClaimError(null);
    setClaimMessage(null);
    try {
      const message = await claimDoctorInvite.mutateAsync(values.code);
      setRefreshingSession(true);
      const refreshed = await authService.getCurrentSession();
      if (refreshed) {
        setSession(refreshed);
      }
      setClaimMessage(message);
      if (refreshed?.role === "doctor") {
        router.replace("/agenda");
      }
    } catch (cause) {
      setClaimError(
        cause instanceof InviteError
          ? cause.message
          : "Could not claim invite code.",
      );
    } finally {
      setRefreshingSession(false);
    }
  };

  return (
    <View className="flex-1 bg-surface-muted">
      <ShellHeader title="Profile" />
      {initialLoading ? (
        <ScreenLoadingSkeleton>
          <View className="gap-4 px-4">
            <CardSkeleton lines={4} />
            <CardSkeleton lines={6} />
          </View>
        </ScreenLoadingSkeleton>
      ) : blockingError ? (
        <View className="flex-1 justify-center px-4">
          <SchedulingStatePanel
            message={profileErrorMessage(blockingError)}
            onRetry={() => void profileQuery.refetch()}
          />
        </View>
      ) : (
        <ScrollView
          contentContainerClassName="gap-4 px-4 pb-8 pt-2"
          refreshControl={
            <RefreshControl
              refreshing={userRefreshing}
              onRefresh={() => void onPullToRefresh()}
            />
          }
        >
          <RefreshErrorNotice
            message={refreshError ? profileErrorMessage(refreshError) : null}
          />
          <Card style={{ gap: 12 }}>
            <Text className="text-base font-semibold text-ink">Account</Text>
            <View className="gap-1">
              <Text className="text-sm font-medium text-ink">Email</Text>
              <Text className="text-base text-ink-muted" selectable>
                {email}
              </Text>
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

          <Card style={{ gap: 12 }}>
            <Text className="text-base font-semibold text-ink">
              Clinician invite code
            </Text>
            <Text className="text-sm text-ink-muted">
              Hospital staff: enter the code from your administrator. You must
              be signed in with the same email address the invite was created
              for.
            </Text>
            <View className="gap-1">
              <Text className="text-sm font-medium text-ink">Invite code</Text>
              <Controller
                control={claimControl}
                name="code"
                render={({ field: { onBlur, onChange, value } }) => (
                  <FormTextInput
                    accessibilityLabel="Clinician invite code"
                    autoCapitalize="characters"
                    onBlur={onBlur}
                    onChangeText={(text) => onChange(text.toUpperCase())}
                    value={value}
                  />
                )}
              />
              <FieldError message={claimErrors.code?.message} />
              <FieldError message={claimError ?? undefined} />
            </View>
            {claimMessage ? (
              <Text accessibilityLiveRegion="polite" className="text-sm text-available">
                {claimMessage}
              </Text>
            ) : null}
            <Pressable
              accessibilityLabel="Claim clinician invite"
              accessibilityRole="button"
              accessibilityState={{ disabled: claiming }}
              className="min-h-12 items-center justify-center rounded-xl border border-primary web:hover:opacity-90"
              disabled={claiming}
              onPress={() => void handleClaimSubmit(claimInvite)()}
            >
              {claiming ? (
                <ActivityIndicator />
              ) : (
                <Text className="font-semibold text-primary">Activate clinician access</Text>
              )}
            </Pressable>
          </Card>

          <Card style={{ gap: 12 }}>
            <Text className="text-base font-semibold text-ink">Contact (optional)</Text>
            {(
              [
                ["emergencyContactName", "Emergency contact name", "text"],
                ["emergencyContactPhone", "Emergency contact phone", "phone"],
                ["address", "Home address", "multiline"],
              ] as const
            ).map(([name, label, kind]) => (
              <View className="gap-1" key={name}>
                <Text className="text-sm font-medium text-ink">{label}</Text>
                <Controller
                  control={control}
                  name={name}
                  render={({ field: { onBlur, onChange, value } }) => (
                    <FormTextInput
                      accessibilityLabel={label}
                      kind={
                        kind === "multiline"
                          ? "multiline"
                          : kind === "phone"
                            ? "phone"
                            : "text"
                      }
                      onBlur={onBlur}
                      onChangeText={onChange}
                      value={value ?? ""}
                    />
                  )}
                />
                <FieldError message={errors[name]?.message} />
              </View>
            ))}
          </Card>

          {session?.userId ? (
            <NotificationPreferencesCard
              phone={phoneValue}
              userId={session.userId}
            />
          ) : null}

          <Card style={{ gap: 12 }}>
            <Text className="text-base font-semibold text-ink">
              Medical information (optional)
            </Text>
            <Text className="text-sm text-ink-muted">
              Shared with your care team when relevant. Nothing here is required to book.
            </Text>
            {(
              [
                ["bloodType", "Blood type", "text"],
                ["allergies", "Allergies", "multiline"],
                ["medications", "Current medications", "multiline"],
                ["medicalConditions", "Conditions / diagnoses", "multiline"],
                ["medicalNotes", "Other notes for clinicians", "multiline"],
              ] as const
            ).map(([name, label, kind]) => (
              <View className="gap-1" key={name}>
                <Text className="text-sm font-medium text-ink">{label}</Text>
                <Controller
                  control={control}
                  name={name}
                  render={({ field: { onBlur, onChange, value } }) => (
                    <FormTextInput
                      accessibilityLabel={label}
                      kind={kind === "multiline" ? "multiline" : "text"}
                      onBlur={onBlur}
                      onChangeText={onChange}
                      value={value ?? ""}
                    />
                  )}
                />
                <FieldError message={errors[name]?.message} />
              </View>
            ))}
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

          <Card style={{ gap: 8 }}>
            <Text className="text-base font-semibold text-ink">Delete account</Text>
            <Text className="text-sm text-ink-muted">
              Permanently delete your account, health details, family members and
              appointment history. Upcoming visits are cancelled.
            </Text>
            <Link href="/delete-account" asChild>
              <Pressable
                accessibilityLabel="Delete account"
                accessibilityRole="link"
                className="min-h-12 justify-center self-start web:hover:opacity-80"
              >
                <Text className="text-base font-semibold text-danger">
                  Delete account…
                </Text>
              </Pressable>
            </Link>
          </Card>
        </ScrollView>
      )}
    </View>
  );
}
