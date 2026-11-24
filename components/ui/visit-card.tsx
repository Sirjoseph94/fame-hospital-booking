import { Pressable, Text, View } from "react-native";
import { format, parseISO } from "date-fns";
import { CalendarClock, MapPin, Video } from "lucide-react-native";

import { Card } from "@/components/ui/card";
import { visitStatusLabel } from "@/lib/visit-status-label";
import { colors } from "@/lib/theme-colors";
import type {
  AppointmentDbStatus,
  AppointmentStatus,
  AppointmentType,
} from "@/types/scheduling";

interface VisitCardProps {
  beneficiaryName: string;
  doctorName: string;
  startsAt: string;
  type: AppointmentType;
  status: AppointmentStatus;
  dbStatus?: AppointmentDbStatus;
  room?: string;
  address?: string;
  proxyTag?: string;
  telehealthJoinLabel?: string;
  onPress?: () => void;
  onJoinTelehealth?: () => void;
}

function typeLabel(type: AppointmentType): string {
  if (type === "in-clinic") {
    return "In clinic";
  }
  if (type === "telehealth") {
    return "Telehealth";
  }
  return "Home visit";
}

export function VisitCard({
  beneficiaryName,
  doctorName,
  startsAt,
  type,
  status,
  dbStatus,
  room,
  address,
  proxyTag,
  telehealthJoinLabel,
  onPress,
  onJoinTelehealth,
}: VisitCardProps) {
  const when = format(parseISO(startsAt), "EEE, MMM d · h:mm a");
  const badge = visitStatusLabel(status, dbStatus, "patient");
  const summary = `${badge} visit for ${beneficiaryName} with ${doctorName}`;
  const showTelehealthJoin =
    telehealthJoinLabel &&
    status === "upcoming" &&
    type === "telehealth" &&
    dbStatus === "confirmed";

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
        <View className="rounded-full bg-surface-muted px-3 py-1">
          <Text className="text-xs font-semibold uppercase text-ink-muted">
            {badge}
          </Text>
        </View>
      </View>

      <View className="flex-row items-center gap-2">
        <View className="text-ink-muted">
          <CalendarClock color={colors["ink-muted"]} size={18} />
        </View>
        <Text className="text-base text-ink" selectable>
          {when}
        </Text>
      </View>

      <Text className="text-sm text-ink-muted">{typeLabel(type)}</Text>

      {type === "in-clinic" && room ? (
        <View className="flex-row items-center gap-2">
          <View className="text-ink-muted">
            <MapPin color={colors["ink-muted"]} size={18} />
          </View>
          <Text className="text-sm text-ink" selectable>
            Room {room}
          </Text>
        </View>
      ) : null}

      {type === "home-visit" && address ? (
        <View className="flex-row items-center gap-2">
          <View className="text-ink-muted">
            <MapPin color={colors["ink-muted"]} size={18} />
          </View>
          <Text className="text-sm text-ink" selectable>
            {address}
          </Text>
        </View>
      ) : null}

      {proxyTag ? (
        <Text className="text-sm text-ink-muted" selectable>
          {proxyTag}
        </Text>
      ) : null}

      {showTelehealthJoin ? (
        <Pressable
          accessibilityLabel={telehealthJoinLabel}
          accessibilityRole="button"
          className="min-h-12 flex-row items-center justify-center gap-2 rounded-xl bg-primary px-4 web:hover:opacity-90"
          onPress={onJoinTelehealth}
        >
          <View className="text-surface">
            <Video color={colors.surface} size={18} />
          </View>
          <Text className="text-base font-semibold text-surface">
            {telehealthJoinLabel}
          </Text>
        </Pressable>
      ) : null}
    </Card>
  );

  if (!onPress) {
    return (
      <View accessibilityLabel={summary}>{body}</View>
    );
  }

  return (
    <Pressable
      accessibilityLabel={summary}
      accessibilityRole="button"
      className="web:hover:opacity-95"
      onPress={onPress}
    >
      {body}
    </Pressable>
  );
}
