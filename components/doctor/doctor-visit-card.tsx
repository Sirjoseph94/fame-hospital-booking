import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { formatSchedulingTimeRange } from "@/lib/format-scheduling-time";
import { CalendarClock, ChevronDown, ChevronUp, MapPin, Video } from "lucide-react-native";

import { Card } from "@/components/ui/card";
import type {
  AppointmentDbStatus,
  AppointmentStatus,
  AppointmentType,
} from "@/types/scheduling";

interface DoctorVisitCardProps {
  beneficiaryName: string;
  startsAt: string;
  endsAt: string;
  type: AppointmentType;
  status: AppointmentStatus;
  room?: string;
  proxyTag?: string;
  reason?: string;
  notes?: string;
  telehealthJoinLabel?: string;
  onJoinTelehealth?: () => void;
  dbStatus?: AppointmentDbStatus;
  onConfirm?: () => void;
  onMarkComplete?: () => void;
  onReschedule?: () => void;
  onCancel?: () => void;
  manageBusy?: boolean;
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

function statusLabel(
  status: AppointmentStatus,
  dbStatus?: AppointmentDbStatus,
): string {
  if (status === "completed") {
    return "Completed";
  }
  if (status === "cancelled") {
    return "Cancelled";
  }
  if (dbStatus === "pending") {
    return "Needs confirmation";
  }
  return "Confirmed";
}

export function DoctorVisitCard({
  beneficiaryName,
  startsAt,
  endsAt,
  type,
  status,
  room,
  proxyTag,
  reason,
  notes,
  telehealthJoinLabel,
  onJoinTelehealth,
  dbStatus,
  onConfirm,
  onMarkComplete,
  onReschedule,
  onCancel,
  manageBusy = false,
}: DoctorVisitCardProps) {
  const [clinicalOpen, setClinicalOpen] = useState(false);
  const when = formatSchedulingTimeRange(startsAt, endsAt);
  const summary = `${statusLabel(status, dbStatus)} visit with ${beneficiaryName}, ${when}`;
  const showManageActions =
    status === "upcoming" &&
    Boolean(onConfirm || onMarkComplete || onReschedule || onCancel);
  const pending = status === "upcoming" && dbStatus === "pending";
  const clinicalSnippet = [reason?.trim(), notes?.trim()].filter(Boolean);

  return (
    <View accessibilityLabel={summary}>
      <Card
        style={{
          gap: 12,
          ...(pending
            ? { borderWidth: 1, borderColor: "#d97706" }
            : {}),
        }}
      >
        <View className="flex-row items-start justify-between gap-3">
          <View className="min-w-0 flex-1 gap-1">
            <Text className="text-base font-semibold text-ink" selectable>
              {beneficiaryName}
            </Text>
            <Text className="text-sm text-ink-muted">{typeLabel(type)}</Text>
          </View>
          <View
            className={`rounded-full px-3 py-1 ${
              pending ? "bg-amber-100" : "bg-surface-muted"
            }`}
          >
            <Text
              className={`text-xs font-semibold uppercase ${
                pending ? "text-amber-800" : "text-ink-muted"
              }`}
            >
              {statusLabel(status, dbStatus)}
            </Text>
          </View>
        </View>

        <View className="flex-row items-center gap-2">
          <View className="text-ink-muted">
            <CalendarClock color="currentColor" size={18} />
          </View>
          <Text className="text-base text-ink" selectable>
            {when}
          </Text>
        </View>

        {type === "telehealth" ? (
          <View className="flex-row items-center gap-2">
            <View className="text-ink-muted">
              <Video color="currentColor" size={18} />
            </View>
            <Text className="text-sm text-ink-muted">Video visit</Text>
          </View>
        ) : null}

        {room ? (
          <View className="flex-row items-center gap-2">
            <View className="text-ink-muted">
              <MapPin color="currentColor" size={18} />
            </View>
            <Text className="text-sm text-ink" selectable>
              Room {room}
            </Text>
          </View>
        ) : null}

        {proxyTag ? (
          <Text className="text-sm text-ink-muted" selectable>
            {proxyTag}
          </Text>
        ) : null}

        {clinicalSnippet.length > 0 ? (
          <View className="gap-2">
            <Pressable
              accessibilityLabel={
                clinicalOpen
                  ? "Hide reason and notes"
                  : "Show reason and notes"
              }
              accessibilityRole="button"
              className="min-h-10 flex-row items-center justify-between web:hover:opacity-80"
              onPress={() => setClinicalOpen((open) => !open)}
            >
              <Text className="text-sm font-semibold text-primary">
                Reason & notes
              </Text>
              <View className="text-primary">
                {clinicalOpen ? (
                  <ChevronUp color="currentColor" size={18} />
                ) : (
                  <ChevronDown color="currentColor" size={18} />
                )}
              </View>
            </Pressable>
            {clinicalOpen ? (
              <View className="gap-1">
                {reason?.trim() ? (
                  <Text className="text-sm text-ink" selectable>
                    Reason: {reason.trim()}
                  </Text>
                ) : null}
                {notes?.trim() ? (
                  <Text className="text-sm text-ink-muted" selectable>
                    Notes: {notes.trim()}
                  </Text>
                ) : null}
              </View>
            ) : (
              <Text className="text-sm text-ink-muted" numberOfLines={1}>
                {clinicalSnippet.join(" · ")}
              </Text>
            )}
          </View>
        ) : null}

        {telehealthJoinLabel && status === "upcoming" && type === "telehealth" ? (
          <Pressable
            accessibilityLabel={telehealthJoinLabel}
            accessibilityRole="button"
            className="min-h-12 flex-row items-center justify-center gap-2 rounded-xl bg-primary px-4 web:hover:opacity-90"
            onPress={onJoinTelehealth}
          >
            <View className="text-surface">
              <Video color="currentColor" size={18} />
            </View>
            <Text className="text-base font-semibold text-surface">
              {telehealthJoinLabel}
            </Text>
          </Pressable>
        ) : null}

        {showManageActions ? (
          <View className="gap-2 border-t border-surface-muted pt-3">
            {dbStatus === "pending" && onConfirm ? (
              <Pressable
                accessibilityLabel="Confirm appointment"
                accessibilityRole="button"
                accessibilityState={{ disabled: manageBusy, busy: manageBusy }}
                className="min-h-12 items-center justify-center rounded-xl bg-primary px-4 web:hover:opacity-90"
                disabled={manageBusy}
                onPress={onConfirm}
              >
                <Text className="text-base font-semibold text-surface">
                  Confirm appointment
                </Text>
              </Pressable>
            ) : null}
            {dbStatus === "confirmed" && onMarkComplete ? (
              <Pressable
                accessibilityLabel="Mark visit complete"
                accessibilityRole="button"
                accessibilityState={{ disabled: manageBusy, busy: manageBusy }}
                className="min-h-12 items-center justify-center rounded-xl bg-primary px-4 web:hover:opacity-90"
                disabled={manageBusy}
                onPress={onMarkComplete}
              >
                <Text className="text-base font-semibold text-surface">
                  Mark complete
                </Text>
              </Pressable>
            ) : null}
            <View className="flex-row flex-wrap gap-2">
              {onReschedule ? (
                <Pressable
                  accessibilityLabel="Reschedule appointment"
                  accessibilityRole="button"
                  accessibilityState={{ disabled: manageBusy, busy: manageBusy }}
                  className="min-h-12 flex-1 items-center justify-center rounded-xl border border-primary px-3 web:hover:opacity-90"
                  disabled={manageBusy}
                  onPress={onReschedule}
                >
                  <Text className="text-sm font-semibold text-primary">
                    Reschedule
                  </Text>
                </Pressable>
              ) : null}
              {onCancel ? (
                <Pressable
                  accessibilityLabel="Cancel appointment"
                  accessibilityRole="button"
                  accessibilityState={{ disabled: manageBusy, busy: manageBusy }}
                  className="min-h-12 flex-1 items-center justify-center rounded-xl border border-ink-muted px-3 web:hover:opacity-90"
                  disabled={manageBusy}
                  onPress={onCancel}
                >
                  <Text className="text-sm font-semibold text-ink-muted">
                    Cancel
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : null}
      </Card>
    </View>
  );
}
