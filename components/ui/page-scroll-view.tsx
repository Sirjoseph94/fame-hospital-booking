import { Platform, ScrollView, type ScrollViewProps } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * Scroll view for full pages outside the tab bar (sign-in, legal, About…):
 * keeps the last content clear of the home indicator / Android navigation bar
 * and of the keyboard, and lets taps reach buttons while the keyboard is up.
 */
export function PageScrollView({ contentContainerStyle, ...props }: ScrollViewProps) {
  const insets = useSafeAreaInsets();
  // iOS adds the bottom inset itself (contentInsetAdjustmentBehavior).
  const bottom = Platform.OS === "ios" ? 0 : insets.bottom;
  return (
    <ScrollView
      automaticallyAdjustKeyboardInsets
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      {...props}
      contentContainerStyle={[bottom > 0 ? { paddingBottom: bottom + 24 } : null, contentContainerStyle]}
    />
  );
}
