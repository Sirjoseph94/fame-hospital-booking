import { useEffect } from "react";
import { Pressable, Text, View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { format, isSameDay, parseISO } from "date-fns";
import { BellRing, QrCode } from "lucide-react-native";

import { Card } from "@/components/ui/card";
import { checkInWindow } from "@/lib/check-in";
import { useHospitalSettings } from "@/lib/queries/hospital-settings";
import { QUEUE_REFRESH_MS, useQueueStatus } from "@/lib/queries/visit-flow";
import { queryKeys } from "@/lib/query/keys";
import { colors } from "@/lib/theme-colors";
import type { Appointment } from "@/types/scheduling";

function ordinal(n: number): string {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${suffix}`;
}

interface QueueStatusCardProps {
  visit: Appointment & { startsAt: string; endsAt: string };
  room?: string;
  /** Opens the check-in sheet. */
  onCheckIn: () => void;
  /** Smaller layout for the Home card. */
  compact?: boolean;
}

/**
 * The visit on the day: a check-in button when check-in is open, then the
 * patient's place in line (live), then "it's your turn".
 */
export function QueueStatusCard({ visit, room, onCheckIn, compact = false }: QueueStatusCardProps) {
  const queryClient = useQueryClient();
  const settingsQuery = useHospitalSettings();
  const opensMinutes = settingsQuery.data?.checkInOpensMinutes ?? 120;
  const statusQuery = useQueueStatus(visit.id, {
    enabled: visit.status === "upcoming" && Boolean(visit.sessionId) && Boolean(visit.checkedInAt),
    live: false,
  });
  const status = statusQuery.data;
  // Prefer the live status: the visit list itself isn't polled.
  const dbStatus = status?.dbStatus ?? visit.dbStatus;
  const calledAt = status ? status.calledAt : visit.calledAt;
  const checkedInAt = status ? status.checkedInAt : visit.checkedInAt;
  const queueNumber = status?.queueNumber ?? visit.queueNumber;
  const waiting = dbStatus === "confirmed" && Boolean(checkedInAt) && !calledAt;
  const { refetch } = statusQuery;

  // Poll only while waiting in line.
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => void refetch(), QUEUE_REFRESH_MS);
    return () => clearInterval(timer);
  }, [refetch, waiting]);

  // When the live status moves on (called, seen, put back in line), refresh
  // the visit list so every screen agrees.
  const changed =
    status !== undefined &&
    (status.dbStatus !== visit.dbStatus ||
      (status.calledAt ?? null) !== (visit.calledAt ?? null) ||
      (status.checkedInAt ?? null) !== (visit.checkedInAt ?? null));
  useEffect(() => {
    if (changed) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.appointments.all, refetchType: "active" });
    }
  }, [changed, queryClient]);

  if (visit.status !== "upcoming" || !visit.sessionId || visit.sessionCancelled || dbStatus !== "confirmed") {
    return null;
  }

  const roomText = room ? (/^\d/.test(room) ? `Room ${room}` : room) : null;

  if (calledAt) {
    return (
      <Card style={{ gap: 6, borderWidth: 2, borderColor: colors.available }}>
        <View accessibilityLiveRegion="assertive" className="flex-row items-center gap-3">
          <BellRing color={colors.available} size={28} />
          <View className="min-w-0 flex-1">
            <Text className="text-lg font-bold text-ink">It&apos;s your turn</Text>
            <Text className="text-base text-ink">
              The doctor is ready to see you{roomText ? ` in ${roomText}` : ""}.
            </Text>
          </View>
        </View>
      </Card>
    );
  }

  if (checkedInAt) {
    const position = status?.position;
    return (
      <Card style={{ gap: 10 }}>
        <View className="flex-row items-center gap-4">
          <View
            accessibilityLabel={`Your number is ${queueNumber ?? "being assigned"}`}
            className="h-16 w-16 items-center justify-center rounded-2xl bg-primary"
          >
            <Text className="text-2xl font-extrabold text-surface">{queueNumber ?? "–"}</Text>
          </View>
          <View accessibilityLiveRegion="polite" className="min-w-0 flex-1 gap-0.5">
            <Text className="text-base font-bold text-ink">
              {position === 1 ? "You're next" : position ? `You're ${ordinal(position)} in line` : "Checked in"}
            </Text>
            <Text className="text-sm text-ink-muted">
              {status
                ? `${status.waiting} waiting${status.nowServing ? ` · now seeing #${status.nowServing}` : ""}`
                : "Finding your place in line…"}
            </Text>
          </View>
        </View>
        {!compact ? (
          <Text className="text-xs text-ink-muted">
            Updates every {QUEUE_REFRESH_MS / 1000} seconds. We&apos;ll notify you when you&apos;re next and when it&apos;s your turn.
            Checked in at {format(parseISO(checkedInAt), "h:mm a")}.
          </Text>
        ) : null}
      </Card>
    );
  }

  const checkIn = checkInWindow(visit.startsAt, visit.endsAt, opensMinutes);
  const today = isSameDay(parseISO(visit.startsAt), new Date());
  if (checkIn === "open") {
    return (
      <Card style={{ gap: 10 }}>
        <Text className="text-base font-semibold text-ink">Arrived at the hospital?</Text>
        <Text className="text-sm text-ink-muted">
          Check in to join the queue. Patients are seen in order of arrival.
        </Text>
        <Pressable
          accessibilityHint="Scan the code at reception or type it"
          accessibilityLabel="Check in"
          accessibilityRole="button"
          className="min-h-12 flex-row items-center justify-center gap-2 rounded-xl bg-primary px-4 web:hover:opacity-90 active:opacity-80"
          onPress={onCheckIn}
        >
          <QrCode color={colors.surface} size={20} />
          <Text className="text-base font-semibold text-surface">Check in</Text>
        </Pressable>
      </Card>
    );
  }
  if (checkIn === "not-open" && today && !compact) {
    const opensAt = new Date(parseISO(visit.startsAt).getTime() - opensMinutes * 60_000);
    return (
      <Card style={{ gap: 4 }}>
        <Text className="text-sm text-ink">
          Check-in opens at {format(opensAt, "h:mm a")}. Scan the code at reception when you arrive.
        </Text>
      </Card>
    );
  }
  return null;
}
