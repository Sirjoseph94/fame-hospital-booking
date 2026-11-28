import "../global.css";

import { Stack, type ErrorBoundaryProps } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Pressable, Text, View } from "react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import {
  SafeAreaInsetsContext,
  SafeAreaProvider,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import type { PropsWithChildren } from "react";

import { AuthBootstrap } from "@/components/auth-bootstrap";
import { OfflineBanner } from "@/components/offline-banner";
import { queryClient } from "@/lib/query/client";

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <View className="flex-1 items-center justify-center gap-4 bg-surface px-6">
      <Text accessibilityRole="header" className="text-xl font-bold text-ink">
        Something went wrong
      </Text>
      <Text className="text-center text-base text-ink-muted">
        An unexpected error occurred. Please try again.
      </Text>
      {__DEV__ ? (
        <Text className="text-center text-xs text-ink-muted" selectable>
          {error.message}
        </Text>
      ) : null}
      <Pressable
        accessibilityLabel="Try again"
        accessibilityRole="button"
        className="min-h-12 justify-center rounded-xl bg-primary px-5 web:hover:opacity-90"
        onPress={() => void retry()}
      >
        <Text className="text-base font-semibold text-white">Try again</Text>
      </Pressable>
    </View>
  );
}

/**
 * Keeps every screen clear of the status bar / notch and of the side insets
 * in landscape, once, here. Descendants see those insets as 0 so nothing
 * (e.g. a native stack header on Android) adds them again; the bottom inset
 * is left for the tab bar, sheets and full-page scroll views.
 */
function SafeAreaFrame({ children }: PropsWithChildren) {
  const insets = useSafeAreaInsets();
  return (
    <View
      className="flex-1 bg-surface-muted"
      style={{ paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }}
    >
      <SafeAreaInsetsContext.Provider value={{ ...insets, top: 0, left: 0, right: 0 }}>
        {children}
      </SafeAreaInsetsContext.Provider>
    </View>
  );
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <GestureHandlerRootView className="flex-1">
        <SafeAreaProvider>
          <AuthBootstrap>
            <StatusBar style="dark" />
            <SafeAreaFrame>
              <OfflineBanner />
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="(auth)" />
                <Stack.Screen name="(patient)" />
                <Stack.Screen name="(doctor)" />
                <Stack.Screen name="(admin)" />
                <Stack.Screen name="privacy" />
                <Stack.Screen name="terms" />
                <Stack.Screen name="delete-account" />
                <Stack.Screen name="about" />
                <Stack.Screen name="check-in" />
                <Stack.Screen name="dev" />
              </Stack>
            </SafeAreaFrame>
          </AuthBootstrap>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </QueryClientProvider>
  );
}
