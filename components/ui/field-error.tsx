import { Text } from "react-native";

interface FieldErrorProps {
  message?: string;
}

export function FieldError({ message }: FieldErrorProps) {
  if (!message) {
    return null;
  }

  return (
    <Text accessibilityLiveRegion="polite" className="text-sm text-ink">
      {message}
    </Text>
  );
}
