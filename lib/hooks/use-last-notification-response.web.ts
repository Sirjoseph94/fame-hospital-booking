import type { NotificationResponse } from "expo-notifications";

/** Web has no native notification responses (expo-notifications throws here). */
export function useLastNotificationResponse(): NotificationResponse | null | undefined {
  return undefined;
}
