import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { AndroidImportance } from "expo-notifications";
import { router } from "expo-router";
import { useEffect, useRef } from "react";
import { Platform } from "react-native";

import { useLastNotificationResponse } from "@/lib/hooks/use-last-notification-response";
import { notificationHref } from "@/lib/notification-routes";
import { queryClient } from "@/lib/query/client";
import { invalidateScheduling } from "@/lib/query/keys";
import { colors } from "@/lib/theme-colors";

import {
  notificationsService,
  setCachedPushToken,
} from "@/lib/services/notifications";
import { useSessionStore } from "@/lib/stores/session";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Android 8+ only shows notifications on a channel the app created. The push
 * service sends to "default" (supabase/functions/dispatch-notifications).
 */
async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== "android") {
    return;
  }
  await Notifications.setNotificationChannelAsync("default", {
    name: "Visit updates",
    description: "Bookings, reminders and your place in the queue",
    importance: AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 150, 250],
    lightColor: colors.primary,
  });
}

export async function syncPushRegistration(userId: string): Promise<void> {
  if (Platform.OS === "web") {
    return;
  }
  try {
    const prefs = await notificationsService.getNotificationPreferences(userId);
    if (!prefs.pushOptIn) {
      return;
    }
    const token = await resolveExpoPushToken();
    if (!token) {
      return;
    }
    const platform = Platform.OS === "ios" ? "ios" : "android";
    await notificationsService.registerPushToken(userId, token, platform);
    setCachedPushToken(token);
  } catch {
    // Non-fatal.
  }
}

async function resolveExpoPushToken(): Promise<string | null> {
  if (Platform.OS === "web" || !Device.isDevice) {
    return null;
  }

  // Create the channel first: on Android 13+ that is what shows the
  // permission prompt.
  await ensureAndroidChannel();

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== "granted") {
    return null;
  }

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;

  if (!projectId) {
    return null;
  }

  const token = await Notifications.getExpoPushTokenAsync({ projectId });
  return token.data;
}

export function usePushNotifications() {
  const session = useSessionStore((state) => state.session);
  const authReady = useSessionStore((state) => state.authReady);
  const syncingRef = useRef(false);
  const lastResponse = useLastNotificationResponse();
  const role = session?.role;

  // A message while the app is open (e.g. "it's your turn"): refresh what's on
  // screen so it matches.
  useEffect(() => {
    if (Platform.OS === "web" || !role) {
      return;
    }
    const subscription = Notifications.addNotificationReceivedListener(() => {
      void invalidateScheduling(queryClient);
    });
    return () => subscription.remove();
  }, [role]);

  // Tapping a notification (including one that launched the app) opens what
  // it's about, once the user is signed in.
  useEffect(() => {
    if (Platform.OS === "web" || !authReady || !role || !lastResponse) {
      return;
    }
    if (lastResponse.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) {
      return;
    }
    const href = notificationHref(
      role,
      lastResponse.notification.request.content.data as Record<string, unknown> | undefined,
    );
    Notifications.clearLastNotificationResponse();
    if (href) {
      // Let the role's navigator mount first on a cold start.
      setTimeout(() => router.push(href), 0);
    }
  }, [authReady, lastResponse, role]);

  useEffect(() => {
    if (!authReady || !session?.userId || Platform.OS === "web") {
      return;
    }

    let cancelled = false;

    void (async () => {
      if (syncingRef.current) {
        return;
      }
      syncingRef.current = true;
      try {
        const prefs = await notificationsService.getNotificationPreferences(
          session.userId,
        );
        if (cancelled || !prefs.pushOptIn) {
          return;
        }

        const token = await resolveExpoPushToken();
        if (cancelled || !token) {
          return;
        }

        const platform = Platform.OS === "ios" ? "ios" : "android";
        await notificationsService.registerPushToken(
          session.userId,
          token,
          platform,
        );
        setCachedPushToken(token);
      } catch {
        // Permission or network failures are non-fatal.
      } finally {
        syncingRef.current = false;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authReady, session?.userId]);
}
