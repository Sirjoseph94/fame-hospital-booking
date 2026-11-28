import { useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, Switch, Text, View } from "react-native";

import { Card } from "@/components/ui/card";
import { FormTextInput } from "@/components/ui/form-text-input";
import { useHospitalSettings, useUpdateSettings } from "@/lib/queries/hospital-settings";
import {
  SETTING_LIMITS,
  validateSettings,
  type EditableSettings,
  type HospitalSettings,
} from "@/lib/services/hospital-settings";
import { colors } from "@/lib/theme-colors";

type NumberKey = keyof typeof SETTING_LIMITS;
type ToggleKey = "remindersEnabled" | "autoNoShow" | "waitlistEnabled";
/** Numbers are edited as text so a field can be cleared while typing. */
type Draft = Record<NumberKey, string> & Record<ToggleKey, boolean>;

function toDraft(settings: HospitalSettings): Draft {
  return {
    bookingWindowDays: String(settings.bookingWindowDays),
    checkInOpensMinutes: String(settings.checkInOpensMinutes),
    reminderEveningHour: String(settings.reminderEveningHour),
    reminderMorningHour: String(settings.reminderMorningHour),
    noShowAfterMinutes: String(settings.noShowAfterMinutes),
    remindersEnabled: settings.remindersEnabled,
    autoNoShow: settings.autoNoShow,
    waitlistEnabled: settings.waitlistEnabled,
  };
}

function fromDraft(draft: Draft): EditableSettings {
  const num = (value: string) => (value.trim() === "" ? Number.NaN : Number(value));
  return {
    bookingWindowDays: num(draft.bookingWindowDays),
    checkInOpensMinutes: num(draft.checkInOpensMinutes),
    reminderEveningHour: num(draft.reminderEveningHour),
    reminderMorningHour: num(draft.reminderMorningHour),
    noShowAfterMinutes: num(draft.noShowAfterMinutes),
    remindersEnabled: draft.remindersEnabled,
    autoNoShow: draft.autoNoShow,
    waitlistEnabled: draft.waitlistEnabled,
  };
}

/** "18" → "6:00 PM". */
function hourLabel(value: string): string {
  const hour = Number(value);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return "";
  const suffix = hour >= 12 ? "PM" : "AM";
  return `${hour % 12 === 0 ? 12 : hour % 12}:00 ${suffix}`;
}

function NumberRow({
  label,
  help,
  unit,
  value,
  onChange,
  limits,
  disabled,
}: {
  label: string;
  help: string;
  unit: string;
  value: string;
  onChange: (value: string) => void;
  limits: { min: number; max: number };
  disabled?: boolean;
}) {
  return (
    <View className={`gap-1 ${disabled ? "opacity-50" : ""}`}>
      <Text className="text-sm font-medium text-ink">{label}</Text>
      <View className="flex-row items-center gap-3">
        <FormTextInput
          accessibilityHint={`From ${limits.min} to ${limits.max}`}
          accessibilityLabel={label}
          className="w-24 text-center"
          editable={!disabled}
          kind="number"
          maxLength={3}
          onChangeText={(text) => onChange(text.replace(/[^\d]/g, ""))}
          value={value}
        />
        <Text className="min-w-0 flex-1 text-sm text-ink-muted">{unit}</Text>
      </View>
      <Text className="text-xs text-ink-muted">{help}</Text>
    </View>
  );
}

function ToggleRow({
  label,
  help,
  value,
  onChange,
}: {
  label: string;
  help: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <View className="flex-row items-center gap-3">
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="text-base font-medium text-ink">{label}</Text>
        <Text className="text-xs text-ink-muted">{help}</Text>
      </View>
      <Switch
        accessibilityLabel={label}
        onValueChange={onChange}
        thumbColor={colors.surface}
        trackColor={{ false: "#CBD5E1", true: colors.primary }}
        value={value}
      />
    </View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="gap-3 border-t border-surface-muted pt-3">
      <Text accessibilityRole="header" className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
        {title}
      </Text>
      {children}
    </View>
  );
}

/** Admin: booking window, check-in, reminders, no-shows and the waitlist. */
export function PlatformSettingsCard() {
  const settingsQuery = useHospitalSettings();
  const update = useUpdateSettings();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const saved = settingsQuery.data;
  if (!saved) {
    return (
      <Card style={{ gap: 12 }}>
        <Text className="text-base font-semibold text-ink">Booking & visits</Text>
        {settingsQuery.isError ? (
          <Text className="text-sm text-danger">Could not load the settings. Pull to refresh.</Text>
        ) : (
          <ActivityIndicator color={colors.primary} />
        )}
      </Card>
    );
  }

  const value = draft ?? toDraft(saved);
  const dirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(toDraft(saved));
  const set = <K extends keyof Draft>(key: K, next: Draft[K]) => {
    setMessage(null);
    setError(null);
    setDraft({ ...value, [key]: next });
  };

  const save = async () => {
    const settings = fromDraft(value);
    const invalid = validateSettings(settings);
    if (invalid) {
      setError(invalid);
      return;
    }
    setError(null);
    try {
      await update.mutateAsync(settings);
      setDraft(null);
      setMessage("Settings saved.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the settings.");
    }
  };

  return (
    <Card style={{ gap: 12 }}>
      <View className="gap-1">
        <Text accessibilityRole="header" className="text-base font-semibold text-ink">
          Booking & visits
        </Text>
        <Text className="text-sm text-ink-muted">
          Times are in the hospital time zone ({saved.timeZone}).
        </Text>
      </View>

      <Section title="Booking">
        <NumberRow
          help="Patients can book sessions up to this far ahead. Doctors can still book follow-ups further out."
          label="Booking window"
          limits={SETTING_LIMITS.bookingWindowDays}
          onChange={(text) => set("bookingWindowDays", text)}
          unit="days ahead"
          value={value.bookingWindowDays}
        />
        <ToggleRow
          help="When a session is full, patients can join its waitlist and are booked automatically if a place frees up."
          label="Waitlist"
          onChange={(next) => set("waitlistEnabled", next)}
          value={value.waitlistEnabled}
        />
      </Section>

      <Section title="Check-in">
        <NumberRow
          help="How early patients can check in at reception before a session starts."
          label="Check-in opens"
          limits={SETTING_LIMITS.checkInOpensMinutes}
          onChange={(text) => set("checkInOpensMinutes", text)}
          unit="minutes before the session"
          value={value.checkInOpensMinutes}
        />
      </Section>

      <Section title="Reminders">
        <ToggleRow
          help="By the channels each patient has turned on (push, SMS, email)."
          label="Send visit reminders"
          onChange={(next) => set("remindersEnabled", next)}
          value={value.remindersEnabled}
        />
        <NumberRow
          disabled={!value.remindersEnabled}
          help={`Reminders for tomorrow's visits go out from this hour, for three hours (12–21).`}
          label="Evening-before reminder"
          limits={SETTING_LIMITS.reminderEveningHour}
          onChange={(text) => set("reminderEveningHour", text)}
          unit={hourLabel(value.reminderEveningHour) || "hour (24-hour clock)"}
          value={value.reminderEveningHour}
        />
        <NumberRow
          disabled={!value.remindersEnabled}
          help="Same-day reminders go out from this hour until the session starts (5–11)."
          label="Morning reminder"
          limits={SETTING_LIMITS.reminderMorningHour}
          onChange={(text) => set("reminderMorningHour", text)}
          unit={hourLabel(value.reminderMorningHour) || "hour (24-hour clock)"}
          value={value.reminderMorningHour}
        />
      </Section>

      <Section title="No-shows">
        <ToggleRow
          help="Booked patients who never check in are recorded as no-shows after their session, and told they missed it."
          label="Record no-shows automatically"
          onChange={(next) => set("autoNoShow", next)}
          value={value.autoNoShow}
        />
        <NumberRow
          disabled={!value.autoNoShow}
          help="Wait this long after a session ends before recording no-shows."
          label="Grace period"
          limits={SETTING_LIMITS.noShowAfterMinutes}
          onChange={(text) => set("noShowAfterMinutes", text)}
          unit="minutes after the session"
          value={value.noShowAfterMinutes}
        />
      </Section>

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
          accessibilityLabel="Save booking and visit settings"
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
            {update.isPending ? "Saving…" : "Save settings"}
          </Text>
        </Pressable>
        {dirty ? (
          <Pressable
            accessibilityLabel="Discard changes"
            accessibilityRole="button"
            className="min-h-12 items-center justify-center rounded-xl border border-ink-muted px-4 web:hover:opacity-90"
            onPress={() => {
              setDraft(null);
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
