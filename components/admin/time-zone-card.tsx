import { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { Card } from "@/components/ui/card";
import { FormTextInput } from "@/components/ui/form-text-input";
import { useHospitalSettings, useUpdateTimeZone } from "@/lib/queries/hospital-settings";
import { colors } from "@/lib/theme-colors";

const SUGGESTIONS = ["Africa/Lagos", "Africa/Accra", "Africa/Nairobi", "Europe/London", "UTC"];

/** The device's own zone, offered as a one-tap suggestion. */
function deviceTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

/** Admin: the hospital's time zone, which decides when a session has ended. */
export function TimeZoneCard() {
  const settingsQuery = useHospitalSettings();
  const update = useUpdateTimeZone();
  const [draft, setDraft] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const saved = settingsQuery.data?.timeZone;
  const value = draft ?? saved ?? "";
  const dirty = value.trim() !== "" && value.trim() !== saved;
  const device = deviceTimeZone();
  const suggestions = [...new Set([device, ...SUGGESTIONS].filter(Boolean) as string[])];

  const save = async () => {
    setMessage(null);
    setError(null);
    try {
      const result = await update.mutateAsync(value);
      setDraft(null);
      setMessage(`Time zone set to ${result.timeZone}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the time zone.");
    }
  };

  return (
    <Card style={{ gap: 12 }}>
      <Text className="text-base font-semibold text-ink">Hospital time zone</Text>
      <Text className="text-sm text-ink-muted">
        Session times are local clock times. This decides when a session has
        ended and can no longer be booked.
      </Text>
      {settingsQuery.isPending ? (
        <ActivityIndicator color={colors.primary} />
      ) : (
        <>
          <FormTextInput
            accessibilityLabel="Hospital time zone"
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setDraft}
            placeholder="Africa/Lagos"
            value={value}
          />
          <View className="flex-row flex-wrap gap-2">
            {suggestions.map((zone) => (
              <Pressable
                key={zone}
                accessibilityLabel={`Use ${zone}`}
                accessibilityRole="button"
                className={[
                  "min-h-10 justify-center rounded-full border px-3",
                  value === zone ? "border-primary bg-primary" : "border-ink-muted bg-surface",
                ].join(" ")}
                onPress={() => setDraft(zone)}
              >
                <Text className={`text-sm ${value === zone ? "text-surface" : "text-ink"}`}>
                  {zone}
                  {zone === device ? " (this device)" : ""}
                </Text>
              </Pressable>
            ))}
          </View>
        </>
      )}
      {error ? (
        <Text accessibilityLiveRegion="polite" className="text-sm text-danger">
          {error}
        </Text>
      ) : null}
      {message ? (
        <Text accessibilityLiveRegion="polite" className="text-sm text-available">
          {message}
        </Text>
      ) : null}
      <Pressable
        accessibilityLabel="Save time zone"
        accessibilityRole="button"
        accessibilityState={{ disabled: !dirty || update.isPending, busy: update.isPending }}
        className={[
          "min-h-12 items-center justify-center rounded-xl px-4 web:hover:opacity-90",
          dirty ? "bg-primary" : "bg-ink-muted opacity-60",
        ].join(" ")}
        disabled={!dirty || update.isPending}
        onPress={() => void save()}
      >
        <Text className="text-base font-semibold text-surface">
          {update.isPending ? "Saving…" : "Save time zone"}
        </Text>
      </Pressable>
    </Card>
  );
}
