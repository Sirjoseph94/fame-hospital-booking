import "../global.css";

import { Stack, type ErrorBoundaryProps } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Pressable, Text, View } from "react-native";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AuthBootstrap } from "@/components/auth-bootstrap";

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

export default function RootLayout() {
  return (
    <GestureHandlerRootView className="flex-1">
      <SafeAreaProvider>
        <BottomSheetModalProvider>
          <AuthBootstrap>
            <StatusBar style="dark" />
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="(auth)" />
              <Stack.Screen name="(patient)" />
              <Stack.Screen name="(doctor)" />
              <Stack.Screen name="(admin)" />
              <Stack.Screen name="dev" />
            </Stack>
          </AuthBootstrap>
        </BottomSheetModalProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
