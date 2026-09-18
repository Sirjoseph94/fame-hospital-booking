import { usePushNotifications } from "@/lib/hooks/use-push-notifications";

export function PushNotificationsBootstrap() {
  usePushNotifications();
  return null;
}
