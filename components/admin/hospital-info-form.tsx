import { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { Card } from "@/components/ui/card";
import { FormTextInput, type FormTextInputProps } from "@/components/ui/form-text-input";
import { DEFAULT_HOSPITAL_INFO, isMissingContact, type HospitalInfo } from "@/lib/hospital-info";
import { useHospitalInfo, useUpdateHospitalInfo } from "@/lib/queries/hospital-info";
import { colors } from "@/lib/theme-colors";

type Draft = Omit<HospitalInfo, "updatedAt">;

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const PHONE_PATTERN = /^[0-9+()\-. ]*$/;

/** Field-level problems, keyed by field (mirrors the database checks). */
export function validateHospitalInfo(draft: Draft): Partial<Record<keyof Draft, string>> {
  const errors: Partial<Record<keyof Draft, string>> = {};
  if (!draft.name.trim()) errors.name = "Enter the hospital's name.";
  if (draft.name.trim().length > 120) errors.name = "Keep the name under 120 characters.";
  if (draft.about.length > 1000) errors.about = "Keep this under 1,000 characters.";
  for (const key of ["phone", "emergencyPhone"] as const) {
    if (!PHONE_PATTERN.test(draft[key].trim()) || draft[key].trim().length > 40) {
      errors[key] = "Use digits, spaces and + ( ) - . only.";
    }
  }
  if (draft.email.trim() && !EMAIL_PATTERN.test(draft.email.trim())) {
    errors.email = "Enter a valid email address.";
  }
  if (draft.website.trim() && !/^https:\/\/\S+$/i.test(draft.website.trim())) {
    errors.website = "Start with https://";
  }
  if (draft.address.length > 300) errors.address = "Keep the address under 300 characters.";
  if (draft.openingHours.length > 200) errors.openingHours = "Keep this under 200 characters.";
  return errors;
}

function Field({
  label,
  hint,
  error,
  ...input
}: FormTextInputProps & { label: string; hint?: string; error?: string }) {
  return (
    <View className="gap-1">
      <Text className="text-sm font-medium text-ink">{label}</Text>
      <FormTextInput accessibilityLabel={label} {...input} />
      {error ? (
        <Text accessibilityLiveRegion="polite" className="text-sm text-danger">
          {error}
        </Text>
      ) : hint ? (
        <Text className="text-xs text-ink-muted">{hint}</Text>
      ) : null}
    </View>
  );
}

function toDraft(info: HospitalInfo): Draft {
  const { updatedAt: _updatedAt, ...rest } = info;
  return rest;
}

/** Admin: the public contact details shown on the About and legal pages. */
export function HospitalInfoForm() {
  const infoQuery = useHospitalInfo();
  const update = useUpdateHospitalInfo();
  const saved = infoQuery.isPlaceholderData ? null : (infoQuery.data ?? null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);

  const value = draft ?? toDraft(saved ?? DEFAULT_HOSPITAL_INFO);
  const errors = validateHospitalInfo(value);
  const dirty = draft !== null && saved !== null && JSON.stringify(draft) !== JSON.stringify(toDraft(saved));

  const set = (key: keyof Draft) => (text: string) => {
    setMessage(null);
    setDraft({ ...value, [key]: text });
  };

  const save = async () => {
    setShowErrors(true);
    setError(null);
    setMessage(null);
    if (Object.keys(errors).length > 0) {
      setError("Fix the highlighted fields.");
      return;
    }
    try {
      await update.mutateAsync(value);
      setDraft(null);
      setShowErrors(false);
      setMessage("Saved. Patients see the new details straight away.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save.");
    }
  };

  if (!saved) {
    return (
      <Card style={{ gap: 12 }}>
        <Text className="text-base font-semibold text-ink">Hospital information</Text>
        {infoQuery.isError ? (
          <Text className="text-sm text-danger">Could not load the hospital details. Pull to refresh.</Text>
        ) : (
          <ActivityIndicator color={colors.primary} />
        )}
      </Card>
    );
  }

  const fieldError = (key: keyof Draft) => (showErrors ? errors[key] : undefined);

  return (
    <Card style={{ gap: 12 }}>
      <View className="gap-1">
        <Text accessibilityRole="header" className="text-base font-semibold text-ink">
          Hospital information
        </Text>
        <Text className="text-sm text-ink-muted">
          Shown to everyone on the About screen, the legal pages and in messages.
        </Text>
      </View>
      {isMissingContact(value) ? (
        <View className="rounded-xl bg-surface-muted p-3">
          <Text className="text-sm text-warning">
            Add a phone number or email. App stores require a way to contact you, and
            patients need it to reach reception.
          </Text>
        </View>
      ) : null}
      <Field error={fieldError("name")} label="Hospital name" maxLength={120} onChangeText={set("name")} value={value.name} />
      <Field
        error={fieldError("about")}
        hint="One or two sentences for the About screen."
        kind="multiline"
        label="About"
        maxLength={1000}
        onChangeText={set("about")}
        value={value.about}
      />
      <Field error={fieldError("phone")} kind="phone" label="Phone (reception)" maxLength={40} onChangeText={set("phone")} placeholder="+234 1 234 5678" value={value.phone} />
      <Field error={fieldError("emergencyPhone")} kind="phone" label="Emergency phone (optional)" maxLength={40} onChangeText={set("emergencyPhone")} value={value.emergencyPhone} />
      <Field error={fieldError("email")} kind="email" label="Email" maxLength={254} onChangeText={set("email")} placeholder="appointments@example.org" value={value.email} />
      <Field error={fieldError("address")} kind="multiline" label="Address" maxLength={300} onChangeText={set("address")} value={value.address} />
      <Field
        error={fieldError("openingHours")}
        label="Opening hours"
        maxLength={200}
        onChangeText={set("openingHours")}
        placeholder="Mon–Sat · 7:00 AM – 9:00 PM"
        value={value.openingHours}
      />
      <Field
        autoCapitalize="none"
        autoCorrect={false}
        error={fieldError("website")}
        inputMode="url"
        keyboardType="url"
        label="Website (optional)"
        maxLength={200}
        onChangeText={set("website")}
        placeholder="https://"
        value={value.website}
      />
      {error ? (
        <Text accessibilityLiveRegion="assertive" className="text-sm text-danger">
          {error}
        </Text>
      ) : null}
      {message ? (
        <Text accessibilityLiveRegion="polite" className="text-sm text-available">
          {message}
        </Text>
      ) : null}
      <View className="flex-row gap-2">
        <Pressable
          accessibilityLabel="Save hospital information"
          accessibilityRole="button"
          accessibilityState={{ disabled: !dirty || update.isPending, busy: update.isPending }}
          className={[
            "min-h-12 flex-1 items-center justify-center rounded-xl px-4 web:hover:opacity-90",
            dirty ? "bg-primary" : "bg-ink-muted opacity-60",
          ].join(" ")}
          disabled={!dirty || update.isPending}
          onPress={() => void save()}
        >
          <Text className="text-base font-semibold text-surface">
            {update.isPending ? "Saving…" : "Save"}
          </Text>
        </Pressable>
        {dirty ? (
          <Pressable
            accessibilityLabel="Discard changes"
            accessibilityRole="button"
            className="min-h-12 items-center justify-center rounded-xl border border-ink-muted px-4 web:hover:opacity-90"
            onPress={() => {
              setDraft(null);
              setShowErrors(false);
              setError(null);
            }}
          >
            <Text className="text-base font-semibold text-ink">Discard</Text>
          </Pressable>
        ) : null}
      </View>
    </Card>
  );
}
