import { Redirect, Stack } from "expo-router";

export default function DevLayout() {
  // Dev-only tooling (kitchen sink, failure injection) must never ship to production.
  if (!__DEV__) {
    return <Redirect href="/" />;
  }

  return (
    <Stack screenOptions={{ headerShown: true, headerShadowVisible: false }} />
  );
}
