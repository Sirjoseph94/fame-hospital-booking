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
import { router } from "expo-router";
import { Controller, useForm, useWatch } from "react-hook-form";

import { NotificationPreferencesCard } from "@/components/notifications/notification-preferences-card";
import { ShellHeader } from "@/components/shell-header";
import { Card } from "@/components/ui/card";
import { FieldError } from "@/components/ui/field-error";
import { FormTextField } from "@/components/ui/form-text-field";
import { FormTextInput } from "@/components/ui/form-text-input";
import { SchedulingStatePanel } from "@/components/ui/scheduling-state-panel";
import { CardSkeleton, ScreenLoadingSkeleton } from "@/components/ui/skeleton";
import { authService } from "@/lib/services/auth";
import { InviteError, invitesService } from "@/lib/services/invites";
import { profileService } from "@/lib/services/profile";
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

export default function PatientProfileScreen() {
  const session = useSessionStore((state) => state.session);
  const setSession = useSessionStore((state) => state.setSession);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);
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

  const userId = session?.userId;

  const load = useCallback(async () => {
    if (!userId) {
      return;
    }
    setError(null);
    try {
      const profile = await profileService.getPatientProfile(userId);
      setEmail(profile.email);
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

  const save = async (values: PatientProfileFormFields) => {
    if (!session) {
      return;
    }
    setSaving(true);
    setSaveMessage(null);
    try {
      const updated = await profileService.updatePatientProfile(
        session.userId,
        {
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
        },
      );
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

  const claimInvite = async (values: DoctorClaimCodeFields) => {
    setClaiming(true);
    setClaimError(null);
    setClaimMessage(null);
    try {
      const message = await invitesService.claimDoctorInvite(values.code);
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
      setClaiming(false);
    }
  };

  return (
    <View className="flex-1 bg-surface-muted">
      <ShellHeader title="Profile" />
      {loading ? (
        <ScreenLoadingSkeleton>
          <View className="gap-4 px-4">
            <CardSkeleton lines={4} />
            <CardSkeleton lines={6} />
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
              Hospital staff: enter the code from your administrator after you
              create an account. The invite email is informational only—we do
              not verify it matches this account.
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
        </ScrollView>
      )}
    </View>
  );
}
