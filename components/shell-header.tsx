import { useRef } from "react";
import { Pressable, Text, View } from "react-native";
import { Info, LogOut } from "lucide-react-native";
import { router } from "expo-router";

import { TimeZoneNotice } from "@/components/time-zone-notice";
import { BackButton } from "@/components/ui/back-button";
import { confirmAsync } from "@/lib/confirm";
import { authService } from "@/lib/services/auth";
import { notificationsService } from "@/lib/services/notifications";
import { useBookingStore } from "@/lib/stores/booking";
import { useSessionStore } from "@/lib/stores/session";
import { colors } from "@/lib/theme-colors";

interface ShellHeaderProps {
  title: string;
  /** Shows a back chevron (e.g. admin pages opened from "More" on phones). */
  onBack?: () => void;
}

export function ShellHeader({ title, onBack }: ShellHeaderProps) {
  const displayName = useSessionStore(
    (state) => state.session?.displayName ?? "",
  );
  const setSession = useSessionStore((state) => state.setSession);

  const signingOutRef = useRef(false);

  const handleSignOut = async () => {
    if (signingOutRef.current) {
      return;
    }
    const confirmed = await confirmAsync({
      title: "Sign out?",
      message: "You'll need your email and password to sign back in.",
      confirmText: "Sign out",
      cancelText: "Stay signed in",
    });
    if (!confirmed) {
      return;
    }
    signingOutRef.current = true;
    try {
      useBookingStore.getState().resetBookingDraft();
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
    <View>
      <View className="flex-row items-center justify-between gap-2 px-4 py-3">
        {onBack ? <BackButton iconOnly label="Back" onPress={onBack} /> : null}
        <View className="min-w-0 flex-1">
          <Text accessibilityRole="header" className="text-lg font-bold text-ink" numberOfLines={1}>
            {title}
          </Text>
          <Text className="text-sm text-ink-muted" numberOfLines={1}>
            {displayName}
          </Text>
        </View>
        <Pressable
          accessibilityLabel="About the hospital"
          accessibilityRole="button"
          className="h-12 w-12 items-center justify-center rounded-full web:hover:bg-surface active:opacity-70"
          onPress={() => router.push("/about")}
        >
          <Info color={colors.ink} size={22} />
        </Pressable>
        <Pressable
          accessibilityLabel="Sign out"
          accessibilityRole="button"
          className="h-12 w-12 items-center justify-center rounded-full web:hover:bg-surface active:opacity-70"
          onPress={() => void handleSignOut()}
        >
          <LogOut color={colors.ink} size={22} />
        </Pressable>
      </View>
      <TimeZoneNotice />
    </View>
  );
}
