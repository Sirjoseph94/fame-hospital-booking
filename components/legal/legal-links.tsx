import { Link } from "expo-router";
import { Text, View } from "react-native";

const linkClassName =
  "min-h-12 px-2 py-3 text-sm font-medium text-ink-muted web:hover:underline";

/** Footer row linking to the public Privacy Policy and Terms of Service. */
export function LegalLinks() {
  return (
    <View className="flex-row flex-wrap items-center justify-center">
      <Link accessibilityRole="link" className={linkClassName} href="/privacy">
        Privacy Policy
      </Link>
      <Text aria-hidden className="text-sm text-ink-muted">
        ·
      </Text>
      <Link accessibilityRole="link" className={linkClassName} href="/terms">
        Terms of Service
      </Link>
    </View>
  );
}
