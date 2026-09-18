import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  Text,
} from "react-native";
import { format, isFuture, parseISO } from "date-fns";

import { Card } from "@/components/ui/card";
import {
  SchedulingError,
  schedulingService,
} from "@/lib/services/scheduling";
import type { BlackoutRule } from "@/types/scheduling";

interface BlackoutRuleCardProps {
  rule: BlackoutRule;
  setByLabel: string;
  onDeleted: () => void;
}

function formatBlackoutRange(rule: BlackoutRule): string {
  return `${format(parseISO(rule.startsAt), "MMM d · h:mm a")} – ${format(parseISO(rule.endsAt), "h:mm a")}`;
}

export function BlackoutRuleCard({
  rule,
  setByLabel,
  onDeleted,
}: BlackoutRuleCardProps) {
  const [deleting, setDeleting] = useState(false);
  const canDelete = isFuture(parseISO(rule.endsAt));

  const confirmDelete = () => {
    Alert.alert(
      "Remove blackout?",
      "Overlapping slots that are still blocked only by this window will become available again.",
      [
        { text: "Keep", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            void (async () => {
              setDeleting(true);
              try {
                await schedulingService.deleteBlackout(rule.id);
                onDeleted();
              } catch (cause) {
                const message =
                  cause instanceof SchedulingError
                    ? cause.message
                    : "Could not remove blackout.";
                Alert.alert("Remove failed", message);
              } finally {
                setDeleting(false);
              }
            })();
          },
        },
      ],
    );
  };

  return (
    <Card style={{ gap: 6 }}>
      <Text className="text-base font-semibold text-ink" selectable>
        {rule.reason}
      </Text>
      <Text className="text-sm text-ink-muted" selectable>
        {formatBlackoutRange(rule)}
      </Text>
      <Text className="text-xs uppercase text-ink-muted">{setByLabel}</Text>
      {canDelete ? (
        <Pressable
          accessibilityLabel="Remove this blackout"
          accessibilityRole="button"
          accessibilityState={{ disabled: deleting, busy: deleting }}
          className="min-h-11 items-center justify-center rounded-xl border border-ink-muted px-3 web:hover:opacity-90"
          disabled={deleting}
          onPress={confirmDelete}
        >
          {deleting ? (
            <ActivityIndicator />
          ) : (
            <Text className="text-sm font-semibold text-ink-muted">Remove</Text>
          )}
        </Pressable>
      ) : null}
    </Card>
  );
}
