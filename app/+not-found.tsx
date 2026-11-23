import { router, Stack } from "expo-router";
import { Pressable, Text, View } from "react-native";

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View className="flex-1 items-center justify-center gap-4 bg-surface px-6">
        <Text accessibilityRole="header" className="text-xl font-bold text-ink">
          Page not found
        </Text>
        <Text className="text-center text-base text-ink-muted">
          The page you were looking for doesn&apos;t exist or has moved.
        </Text>
        <Pressable
          accessibilityLabel="Go to home"
          accessibilityRole="link"
          className="min-h-12 justify-center rounded-xl bg-primary px-5 web:hover:opacity-90"
          onPress={() => router.replace("/")}
        >
          <Text className="text-base font-semibold text-white">Go to home</Text>
        </Pressable>
      </View>
    </>
  );
}
