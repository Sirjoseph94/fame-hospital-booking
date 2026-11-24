import { Text } from "react-native";

interface RefreshErrorNoticeProps {
  message: string | null | undefined;
  /** Extra classes for spacing in the parent layout. */
  className?: string;
}

/**
 * Small, non-blocking error shown above cached data when a background or
 * pull-to-refresh fetch fails (the cached data stays on screen).
 */
export function RefreshErrorNotice({ message, className }: RefreshErrorNoticeProps) {
  if (!message) {
    return null;
  }
  return (
    <Text
      accessibilityLiveRegion="polite"
      className={`text-sm text-ink${className ? ` ${className}` : ""}`}
    >
      {message}
    </Text>
  );
}
