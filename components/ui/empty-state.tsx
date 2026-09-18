import { Text } from "react-native";

import { Card } from "@/components/ui/card";

interface EmptyStateProps {
  message: string;
  title?: string;
}

export function EmptyState({ message, title }: EmptyStateProps) {
  return (
    <Card style={{ gap: 6 }}>
      {title ? (
        <Text className="text-base font-semibold text-ink">{title}</Text>
      ) : null}
      <Text className="text-base text-ink-muted">{message}</Text>
    </Card>
  );
}
