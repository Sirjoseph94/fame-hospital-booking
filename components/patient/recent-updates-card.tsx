import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { formatDistanceToNow, parseISO } from "date-fns";

import { Card } from "@/components/ui/card";
import { useDoctors } from "@/lib/queries/doctors";
import { useMyUpdates } from "@/lib/queries/updates";
import { formatSessionWhen } from "@/lib/session-groups";
import { updateTitle, type UpdateChannel } from "@/lib/services/updates";

const CHANNEL_LABEL: Record<UpdateChannel, string> = {
  email: "email",
  sms: "SMS",
  push: "push",
};

const COLLAPSED_COUNT = 3;

/** Home card: the booking messages we've sent this patient. */
export function RecentUpdatesCard({ userId }: { userId: string }) {
  const updatesQuery = useMyUpdates(userId);
  const doctorsQuery = useDoctors();
  const [expanded, setExpanded] = useState(false);

  const updates = updatesQuery.data ?? [];
  if (updatesQuery.isPending || updates.length === 0) {
    return null;
  }

  const doctorName = (id?: string) =>
    doctorsQuery.data?.find((doctor) => doctor.id === id)?.name;
  const shown = expanded ? updates : updates.slice(0, COLLAPSED_COUNT);

  return (
    <Card style={{ gap: 12 }}>
      <Text accessibilityRole="header" className="text-base font-semibold text-ink">
        Recent updates
      </Text>
      {shown.map((update) => {
        const doctor = doctorName(update.doctorId);
        const when =
          update.startsAt && update.endsAt
            ? formatSessionWhen({ startsAt: update.startsAt, endsAt: update.endsAt })
            : null;
        const delivery =
          update.sentVia.length > 0
            ? `Sent by ${update.sentVia.map((channel) => CHANNEL_LABEL[channel]).join(", ")}`
            : "In-app only";
        return (
          <View key={update.key} className="gap-0.5 border-b border-surface-muted pb-3">
            <View className="flex-row items-center justify-between gap-3">
              <Text className="text-sm font-semibold text-ink">{updateTitle(update.eventType)}</Text>
              <Text className="text-xs text-ink-muted">
                {formatDistanceToNow(parseISO(update.createdAt), { addSuffix: true })}
              </Text>
            </View>
            {doctor || when ? (
              <Text className="text-sm text-ink-muted" selectable>
                {[doctor, when].filter(Boolean).join(" · ")}
              </Text>
            ) : null}
            <Text className="text-xs text-ink-muted">{delivery}</Text>
          </View>
        );
      })}
      {updates.length > COLLAPSED_COUNT ? (
        <Pressable
          accessibilityLabel={expanded ? "Show fewer updates" : "Show all updates"}
          accessibilityRole="button"
          className="min-h-11 justify-center web:hover:opacity-80"
          onPress={() => setExpanded((value) => !value)}
        >
          <Text className="text-sm font-semibold text-primary">
            {expanded ? "Show fewer" : `Show all (${updates.length})`}
          </Text>
        </Pressable>
      ) : null}
    </Card>
  );
}
