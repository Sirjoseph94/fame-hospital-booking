import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { useEffect, useRef } from "react";
import { Platform } from "react-native";

import {
  notificationsService,
  setCachedPushToken,
} from "@/lib/services/notifications";
import { useSessionStore } from "@/lib/stores/session";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

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
