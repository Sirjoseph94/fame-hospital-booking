import { Text, View } from "react-native";
import { useNetworkState } from "expo-network";
import { WifiOff } from "lucide-react-native";

import { colors } from "@/lib/theme-colors";

/** Thin bar shown while the device has no connection. */
export function OfflineBanner() {
  const network = useNetworkState();
  // Unknown (undefined/null) is not offline: only show on a definite "no".
  const offline = network.isConnected === false || network.isInternetReachable === false;
  if (!offline) {
    return null;
  }
  return (
    <View
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      className="flex-row items-center justify-center gap-2 bg-ink px-4 py-2"
    >
      <WifiOff color={colors.surface} size={16} />
      <Text className="text-sm font-medium text-surface">
        You&apos;re offline. Showing saved information; changes need a connection.
      </Text>
    </View>
  );
}
