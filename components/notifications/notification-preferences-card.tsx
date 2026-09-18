import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  Switch,
  Text,
  View,
} from "react-native";

import { Card } from "@/components/ui/card";
import { syncPushRegistration } from "@/lib/hooks/use-push-notifications";
import { notificationsService } from "@/lib/services/notifications";
import type { NotificationPreferencesFields } from "@/lib/validation/notifications";

interface NotificationPreferencesCardProps {
  userId: string;
  phone?: string;
  onPushOptInChange?: (enabled: boolean) => void;
}

export function NotificationPreferencesCard({
  userId,
  phone,
  onPushOptInChange,
}: NotificationPreferencesCardProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<NotificationPreferencesFields>({
    emailOptIn: false,
    smsOptIn: false,
    pushOptIn: false,
  });

  useEffect(() => {
    let cancelled = false;

    void notificationsService
      .getNotificationPreferences(userId)
      .then((next) => {
        if (!cancelled) {
          setPrefs(next);
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not load notification settings.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const save = async (next: NotificationPreferencesFields) => {
    const trimmedPhone = phone?.trim() ?? "";
    if (next.smsOptIn && !trimmedPhone) {
      setError("Add a phone number on your profile before enabling SMS.");
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const saved = await notificationsService.updateNotificationPreferences(
        userId,
        next,
      );
      setPrefs(saved);
      onPushOptInChange?.(saved.pushOptIn);
      if (saved.pushOptIn) {
        await syncPushRegistration(userId);
      }
      setMessage("Notification settings saved.");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not save settings.",
      );
    } finally {
      setSaving(false);
    }
  };

  const toggle = (key: keyof NotificationPreferencesFields, value: boolean) => {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    void save(next);
  };

  if (loading) {
    return (
      <Card style={{ gap: 8, alignItems: "center", paddingVertical: 24 }}>
        <ActivityIndicator />
      </Card>
    );
  }

  const pushDisabled = Platform.OS === "web";

  return (
    <Card style={{ gap: 12 }}>
      <Text className="text-base font-semibold text-ink">Notifications</Text>
      <Text className="text-sm text-ink-muted">
        Opt in to transactional updates about your visits (booking, confirmation,
        cancellation, reschedule). We do not send marketing messages.
      </Text>

      <View className="flex-row items-center justify-between gap-3">
        <View className="min-w-0 flex-1">
          <Text className="text-sm font-medium text-ink">Email</Text>
          <Text className="text-xs text-ink-muted">Sent to your sign-in email</Text>
        </View>
        <Switch
          accessibilityLabel="Email notifications"
          disabled={saving}
          onValueChange={(value) => toggle("emailOptIn", value)}
          value={prefs.emailOptIn}
        />
      </View>

      <View className="flex-row items-center justify-between gap-3">
        <View className="min-w-0 flex-1">
          <Text className="text-sm font-medium text-ink">SMS</Text>
          <Text className="text-xs text-ink-muted">Uses your profile phone number</Text>
        </View>
        <Switch
          accessibilityLabel="SMS notifications"
          disabled={saving}
          onValueChange={(value) => toggle("smsOptIn", value)}
          value={prefs.smsOptIn}
        />
      </View>

      <View className="flex-row items-center justify-between gap-3">
        <View className="min-w-0 flex-1">
          <Text className="text-sm font-medium text-ink">Push</Text>
          <Text className="text-xs text-ink-muted">
            {pushDisabled
              ? "Available on the iOS and Android apps"
              : "Requires device permission"}
          </Text>
        </View>
        <Switch
          accessibilityLabel="Push notifications"
          disabled={saving || pushDisabled}
          onValueChange={(value) => toggle("pushOptIn", value)}
          value={prefs.pushOptIn}
        />
      </View>

      {!pushDisabled && prefs.pushOptIn ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => void Linking.openSettings()}
        >
          <Text className="text-sm text-primary">Open system notification settings</Text>
        </Pressable>
      ) : null}

      {error ? (
        <Text accessibilityLiveRegion="polite" className="text-sm text-danger">
          {error}
        </Text>
      ) : null}
      {message ? (
        <Text accessibilityLiveRegion="polite" className="text-sm text-ink">
          {message}
        </Text>
      ) : null}
    </Card>
  );
}
