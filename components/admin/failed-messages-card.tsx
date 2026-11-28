import { Pressable, Text, View } from "react-native";
import { format, parseISO } from "date-fns";

import { Card } from "@/components/ui/card";
import { showAlert } from "@/lib/confirm";
import { useFailedDeliveries, useRetryDelivery } from "@/lib/queries/deliveries";
import { describeDelivery } from "@/lib/services/deliveries";

/** Admin: messages that couldn't be delivered, with a retry button. */
export function FailedMessagesCard() {
  const failedQuery = useFailedDeliveries();
  const retry = useRetryDelivery();
  const failed = failedQuery.data ?? [];

  const retryOne = async (id: string) => {
    try {
      await retry.mutateAsync(id);
    } catch (cause) {
      showAlert("Retry failed", cause instanceof Error ? cause.message : "Could not retry.");
    }
  };

  return (
    <Card style={{ gap: 12 }}>
      <Text accessibilityRole="header" className="text-base font-semibold text-ink">
        Failed messages{failed.length > 0 ? ` (${failed.length})` : ""}
      </Text>
      {failedQuery.isPending ? (
        <Text className="text-sm text-ink-muted">Loading…</Text>
      ) : failedQuery.isError ? (
        <Text className="text-sm text-danger">
          {failedQuery.error instanceof Error ? failedQuery.error.message : "Could not load."}
        </Text>
      ) : failed.length === 0 ? (
        <Text className="text-sm text-ink-muted">All messages were delivered or skipped.</Text>
      ) : (
        <>
          <Text className="text-sm text-ink-muted">
            Retried messages are sent again by the next retry run (about a minute).
          </Text>
          {failed.map((delivery) => {
            const busy = retry.isPending && retry.variables === delivery.id;
            return (
              <View
                key={delivery.id}
                className="flex-row items-start justify-between gap-3 border-b border-surface-muted pb-3"
              >
                <View className="min-w-0 flex-1 gap-0.5">
                  <Text className="text-sm font-semibold text-ink" selectable>
                    {delivery.recipientName}: {describeDelivery(delivery)}
                  </Text>
                  <Text className="text-xs text-ink-muted">
                    {format(parseISO(delivery.createdAt), "MMM d · h:mm a")} · {delivery.attempts}{" "}
                    {delivery.attempts === 1 ? "attempt" : "attempts"}
                  </Text>
                  {delivery.error ? (
                    <Text className="text-xs text-danger" numberOfLines={2} selectable>
                      {delivery.error}
                    </Text>
                  ) : null}
                </View>
                <Pressable
                  accessibilityLabel={`Retry message to ${delivery.recipientName}`}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: retry.isPending, busy }}
                  className="min-h-11 justify-center rounded-lg border border-primary px-3 web:hover:opacity-90"
                  disabled={retry.isPending}
                  onPress={() => void retryOne(delivery.id)}
                >
                  <Text className="text-sm font-semibold text-primary">{busy ? "…" : "Retry"}</Text>
                </Pressable>
              </View>
            );
          })}
        </>
      )}
    </Card>
  );
}
