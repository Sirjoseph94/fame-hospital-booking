import { Redirect, Stack, usePathname } from "expo-router";
import { Text, View } from "react-native";

import { roleHomeRoutes } from "@/lib/role-routes";
import { useSessionStore } from "@/lib/stores/session";

export default function AuthLayout() {
  const pathname = usePathname();
  const authReady = useSessionStore((state) => state.authReady);
  const hasHydrated = useSessionStore((state) => state.hasHydrated);
  const session = useSessionStore((state) => state.session);
  const completingPasswordReset = pathname.includes("reset-password");

  if (!authReady || !hasHydrated) {
    return (
      <View className="flex-1 items-center justify-center bg-surface-muted px-6">
        <Text
          accessibilityLiveRegion="polite"
          className="text-base text-ink-muted"
        >
          Preparing secure sign-in…
        </Text>
      </View>
    );
  }

  if (session && !completingPasswordReset) {
    return <Redirect href={roleHomeRoutes[session.role]} />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
