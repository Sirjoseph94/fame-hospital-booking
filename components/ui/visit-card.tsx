import { Pressable, Text, View } from "react-native";
import { CalendarClock, MapPin } from "lucide-react-native";

import { Card } from "@/components/ui/card";
import { formatSessionWhen } from "@/lib/session-groups";
import { visitStatusLabel, type VisitProgress } from "@/lib/visit-status-label";
import { colors } from "@/lib/theme-colors";
import type {
  AppointmentDbStatus,
  AppointmentStatus,
} from "@/types/scheduling";

interface VisitCardProps {
  beneficiaryName: string;
  doctorName: string;
  /** Session window. */
  startsAt: string;
  endsAt: string;
  status: AppointmentStatus;
  dbStatus?: AppointmentDbStatus;
  room?: string;
  proxyTag?: string;
  /** The whole clinic session was cancelled (with an optional reason). */
  sessionCancelled?: { reason?: string };
  /** Check-in / queue state on the day. */
  progress?: VisitProgress;
  onPress?: () => void;
}

export function VisitCard({
  beneficiaryName,
  doctorName,
  startsAt,
  endsAt,
  status,
  dbStatus,
  room,
  proxyTag,
  sessionCancelled,
  progress,
  onPress,
}: VisitCardProps) {
  const when = formatSessionWhen({ startsAt, endsAt });
  const badge = visitStatusLabel(status, dbStatus, "patient", startsAt, new Date(), progress);
  const summary = `${badge} visit for ${beneficiaryName} with ${doctorName}, ${when}`;

  const body = (
    <Card style={{ gap: 12 }}>
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1 gap-1">
          <Text className="text-base font-semibold text-ink" selectable>
            {beneficiaryName}
          </Text>
          <Text className="text-sm text-ink-muted" selectable>
            {doctorName}
          </Text>
        </View>
        <View
          className={[
            "rounded-full px-3 py-1",
            status === "missed" ? "bg-danger/10" : progress?.calledAt ? "bg-available/15" : "bg-surface-muted",
          ].join(" ")}
        >
          <Text
            className={[
              "text-xs font-semibold uppercase",
              status === "missed" ? "text-danger" : "text-ink-muted",
            ].join(" ")}
          >
            {badge}
          </Text>
        </View>
      </View>

      <View className="flex-row items-center gap-2">
        <CalendarClock color={colors["ink-muted"]} size={18} />
        <Text className="min-w-0 flex-1 text-base text-ink" selectable>
          {when}
        </Text>
      </View>

      {status === "upcoming" && !progress?.checkedInAt ? (
        <Text className="text-sm text-ink-muted">
          Seen in order of arrival. Check in with the app when you reach reception.
        </Text>
      ) : null}

      {status === "cancelled" && sessionCancelled ? (
        <Text className="text-sm text-ink" selectable>
          The doctor&apos;s clinic was cancelled
          {sessionCancelled.reason ? `: ${sessionCancelled.reason}` : "."} Please book
          another session.
        </Text>
      ) : null}

      {room ? (
        <View className="flex-row items-center gap-2">
          <MapPin color={colors["ink-muted"]} size={18} />
          <Text className="text-sm text-ink" selectable>
            {/^\d/.test(room) ? `Room ${room}` : room}
          </Text>
        </View>
      ) : null}

      {proxyTag ? (
        <Text className="text-sm text-ink-muted" selectable>
          {proxyTag}
        </Text>
      ) : null}
    </Card>
  );

  if (!onPress) {
    return <View accessibilityLabel={summary}>{body}</View>;
  }

  return (
    <Pressable
      accessibilityHint="Opens the visit"
      accessibilityLabel={summary}
      accessibilityRole="button"
      className="web:hover:opacity-95 active:opacity-90"
      onPress={onPress}
    >
      {body}
    </Pressable>
  );
}
