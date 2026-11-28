import { Platform } from "react-native";

import { supabase } from "@/lib/supabase";
import type { NotificationPreferencesFields } from "@/lib/validation/notifications";

export interface NotificationPreferences {
  emailOptIn: boolean;
  smsOptIn: boolean;
  pushOptIn: boolean;
}

interface PreferencesRow {
  email_opt_in: boolean;
  sms_opt_in: boolean;
  push_opt_in: boolean;
}

function mapPreferences(row: PreferencesRow | null): NotificationPreferences {
  return {
    emailOptIn: row?.email_opt_in ?? false,
    smsOptIn: row?.sms_opt_in ?? false,
    pushOptIn: row?.push_opt_in ?? false,
  };
}

let cachedPushToken: string | null = null;

export function setCachedPushToken(token: string | null) {
  cachedPushToken = token;
}

export const notificationsService = {
  async getNotificationPreferences(
    userId: string,
  ): Promise<NotificationPreferences> {
    const { data, error } = await supabase
      .from("notification_preferences")
      .select("email_opt_in, sms_opt_in, push_opt_in")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    return mapPreferences(data as PreferencesRow | null);
  },

  async updateNotificationPreferences(
    userId: string,
    input: NotificationPreferencesFields,
  ): Promise<NotificationPreferences> {
    const { data, error } = await supabase
      .from("notification_preferences")
      .upsert(
        {
          user_id: userId,
          email_opt_in: input.emailOptIn,
          sms_opt_in: input.smsOptIn,
          push_opt_in: input.pushOptIn,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      )
      .select("email_opt_in, sms_opt_in, push_opt_in")
      .single();

    if (error || !data) {
      throw new Error(error?.message ?? "Could not save notification settings.");
    }

    return mapPreferences(data as PreferencesRow);
  },

  async registerPushToken(
    userId: string,
    expoPushToken: string,
    platform: "ios" | "android",
    deviceLabel?: string,
  ): Promise<void> {
    const { error } = await supabase.from("push_device_tokens").upsert(
      {
        user_id: userId,
        expo_push_token: expoPushToken,
        platform,
        device_label: deviceLabel ?? Platform.OS,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "expo_push_token" },
    );

    if (error) {
      throw new Error(error.message);
    }

    cachedPushToken = expoPushToken;
  },

  async removePushToken(expoPushToken: string): Promise<void> {
    const { error } = await supabase
      .from("push_device_tokens")
      .delete()
      .eq("expo_push_token", expoPushToken);

    if (error) {
      throw new Error(error.message);
    }

    if (cachedPushToken === expoPushToken) {
      cachedPushToken = null;
    }
  },

  async removeCachedPushTokenForCurrentUser(): Promise<void> {
    if (!cachedPushToken) {
      return;
    }
    try {
      await this.removePushToken(cachedPushToken);
    } catch {
      cachedPushToken = null;
    }
  },
};
