import { useRef } from "react";
import { Pressable, Text, View } from "react-native";
import { LogOut } from "lucide-react-native";
import { router } from "expo-router";

import { authService } from "@/lib/services/auth";
import { notificationsService } from "@/lib/services/notifications";
import { schedulingService } from "@/lib/services/scheduling";
import { useBookingStore } from "@/lib/stores/booking";
import { useSessionStore } from "@/lib/stores/session";
import { colors } from "@/lib/theme-colors";

interface ShellHeaderProps {
  title: string;
}

export function ShellHeader({ title }: ShellHeaderProps) {
  const displayName = useSessionStore(
    (state) => state.session?.displayName ?? "",
  );
  const setSession = useSessionStore((state) => state.setSession);

  const signingOutRef = useRef(false);

  const handleSignOut = async () => {
    if (signingOutRef.current) {
      return;
    }
    signingOutRef.current = true;
    try {
      const { slotId, hold, resetBookingDraft } = useBookingStore.getState();
      if (slotId && hold) {
        try {
          await schedulingService.releaseHold(slotId);
        } catch {
          // Best-effort before clearing local session.
        }
      }
      resetBookingDraft();
      try {
        await notificationsService.removeCachedPushTokenForCurrentUser();
      } catch {
        // Best-effort; never block sign-out on push token cleanup.
      }
    } finally {
      try {
        await authService.signOut();
      } finally {
        setSession(null);
        signingOutRef.current = false;
        router.replace("/sign-in");
      }
    }
  };

  return (
    <View className="flex-row items-center justify-between gap-4 px-4 py-3">
      <View className="min-w-0 flex-1">
        <Text className="text-lg font-bold text-ink">{title}</Text>
        <Text className="text-sm text-ink-muted" numberOfLines={1}>
          {displayName}
        </Text>
      </View>
      <Pressable
        accessibilityLabel="Sign out"
        accessibilityRole="button"
        className="h-12 w-12 items-center justify-center rounded-full web:hover:bg-surface-muted"
        onPress={() => void handleSignOut()}
      >
        <LogOut color={colors.ink} size={22} />
      </Pressable>
    </View>
  );
}
