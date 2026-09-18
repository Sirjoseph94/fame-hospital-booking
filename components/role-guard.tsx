import type { PropsWithChildren } from "react";
import { Text, View } from "react-native";

import { CardSkeleton } from "@/components/ui/skeleton";
import { Redirect } from "expo-router";

import { roleHomeRoutes } from "@/lib/role-routes";
import { useSessionStore } from "@/lib/stores/session";
import type { Role } from "@/types/scheduling";

interface RoleGuardProps extends PropsWithChildren {
  role: Role;
}

export function RoleGuard({ role, children }: RoleGuardProps) {
  const authReady = useSessionStore((state) => state.authReady);
  const hasHydrated = useSessionStore((state) => state.hasHydrated);
  const session = useSessionStore((state) => state.session);

  if (!hasHydrated || !authReady) {
    return (
      <View
        className="flex-1 items-center justify-center gap-3 bg-surface-muted"
        accessibilityLiveRegion="polite"
      >
        <View className="w-full max-w-sm px-4">
          <CardSkeleton lines={3} />
        </View>
        <Text className="text-base text-ink-muted">Loading your workspace…</Text>
      </View>
    );
  }

  if (!session) {
    return <Redirect href="/sign-in" />;
  }

  if (session.role !== role) {
    return <Redirect href={roleHomeRoutes[session.role]} />;
  }

  return children;
}
