import { useMemo, useState } from "react";
import {
  AccessibilityInfo,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import {
  addDays,
  endOfWeek,
  format,
  startOfDay,
  startOfWeek,
  subDays,
} from "date-fns";
import { router } from "expo-router";
import { ChevronLeft, ChevronRight } from "lucide-react-native";

import { DoctorVisitCard } from "@/components/doctor/doctor-visit-card";
import { ShellHeader } from "@/components/shell-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SchedulingStatePanel } from "@/components/ui/scheduling-state-panel";
import {
  ScreenLoadingSkeleton,
  VisitListSkeleton,
} from "@/components/ui/skeleton";
import { RefreshErrorNotice } from "@/components/ui/refresh-error-notice";
import { confirmAsync, showAlert } from "@/lib/confirm";
import { useHasLoadedOnce } from "@/lib/hooks/use-has-loaded-once";
import { useNow } from "@/lib/hooks/use-now";
import {
  canDoctorMarkVisitComplete,
  filterVisitsForDay,
  formatAgendaDayLabel,
  groupVisitsBySession,
  type AgendaSessionGroup,
  type DoctorAgendaVisit,
} from "@/lib/doctor-agenda-helpers";
import {
  useCancelAppointment,
  useCompleteDoctorAppointment,
  useDoctorAgenda,
} from "@/lib/queries/appointments";
import { useDoctorSessions } from "@/lib/queries/sessions";
import { queryKeys } from "@/lib/query/keys";
import { useRefreshOnFocus } from "@/lib/query/use-refresh-on-focus";
import { SchedulingError } from "@/lib/services/scheduling";
import { formatSessionTimes } from "@/lib/session-groups";
import { useSessionStore } from "@/lib/stores/session";
import { colors } from "@/lib/theme-colors";

function errorMessage(cause: unknown): string {
  return cause instanceof SchedulingError
    ? cause.message
    : "Could not load your agenda.";
}

export default function DoctorAgendaScreen() {
  const session = useSessionStore((state) => state.session);
  const userId = session?.userId;
  const [selectedDay, setSelectedDay] = useState(() => startOfDay(new Date()));
  const [userRefreshing, setUserRefreshing] = useState(false);
  const [actionBanner, setActionBanner] = useState<string | null>(null);

  // "Mark seen" unlocks when a session starts.
  useNow(60_000);

  // One week per request: moving between days in the same week needs no fetch.
  const weekFromYmd = format(startOfWeek(selectedDay, { weekStartsOn: 1 }), "yyyy-MM-dd");
  const weekToYmd = format(endOfWeek(selectedDay, { weekStartsOn: 1 }), "yyyy-MM-dd");
  const dayYmd = format(selectedDay, "yyyy-MM-dd");

  const agendaQuery = useDoctorAgenda(userId, weekFromYmd, weekToYmd);
  const sessionsQuery = useDoctorSessions(userId, weekFromYmd, weekToYmd);
  const completeMutation = useCompleteDoctorAppointment();
  const cancelMutation = useCancelAppointment();

  useRefreshOnFocus([
    queryKeys.appointments.doctorRange(userId ?? "", weekFromYmd, weekToYmd),
    queryKeys.sessions.doctorRange(userId ?? "", weekFromYmd, weekToYmd),
  ]);

  const visits = agendaQuery.data;
  const sessions = sessionsQuery.data;
  const loaded = visits !== undefined && sessions !== undefined;
  // Full-screen skeleton only on the very first load; a newly selected week
  // shows the inline skeleton instead.
  const hasLoadedOnce = useHasLoadedOnce(loaded);
  const weekLoading = agendaQuery.isPending || sessionsQuery.isPending;
  const initialLoading = weekLoading && !hasLoadedOnce;

  const firstError = agendaQuery.error ?? sessionsQuery.error;
  const blockingError = firstError && !loaded ? firstError : null;
  const refreshError = firstError && loaded ? firstError : null;

  const refetchAll = () => Promise.all([agendaQuery.refetch(), sessionsQuery.refetch()]);
  const refresh = async () => {
    setUserRefreshing(true);
    try {
      await refetchAll();
    } finally {
      setUserRefreshing(false);
    }
  };

  const manageBusyId = completeMutation.isPending
    ? completeMutation.variables
    : cancelMutation.isPending
      ? cancelMutation.variables
      : null;

  const groups = useMemo(
    () =>
      groupVisitsBySession(
        filterVisitsForDay(visits ?? [], selectedDay),
        (sessions ?? []).filter((row) => row.dateYmd === dayYmd),
      ),
    [dayYmd, selectedDay, sessions, visits],
  );

  const isToday = dayYmd === format(new Date(), "yyyy-MM-dd");
  const bookedToday = groups.reduce((sum, group) => sum + group.visits.length, 0);

  const shiftDay = (delta: number) => {
    setSelectedDay((current) => (delta < 0 ? subDays(current, 1) : addDays(current, 1)));
  };

  const markSeen = async (visit: DoctorAgendaVisit) => {
    const confirmed = await confirmAsync({
      title: `Mark ${visit.beneficiaryName} seen?`,
      message: "The patient will see this visit as completed.",
      confirmText: "Mark seen",
      cancelText: "Not yet",
    });
    if (!confirmed) {
      return;
    }
    setActionBanner(null);
    try {
      await completeMutation.mutateAsync(visit.id);
      setActionBanner(`${visit.beneficiaryName} marked seen.`);
      AccessibilityInfo.announceForAccessibility("Visit marked complete.");
    } catch (cause) {
      showAlert(
        "Could not update visit",
        cause instanceof SchedulingError ? cause.message : "Could not mark the visit complete.",
      );
    }
  };

  const cancelBooking = async (visit: DoctorAgendaVisit) => {
    const confirmed = await confirmAsync({
      title: "Cancel this booking?",
      message: `${visit.beneficiaryName} will be notified and their place released.`,
      confirmText: "Cancel booking",
      cancelText: "Keep booking",
      destructive: true,
    });
    if (!confirmed) {
      return;
    }
    setActionBanner(null);
    try {
      await cancelMutation.mutateAsync(visit.id);
      setActionBanner("Booking cancelled.");
      AccessibilityInfo.announceForAccessibility("Booking cancelled.");
    } catch (cause) {
      showAlert(
        "Cancel failed",
        cause instanceof SchedulingError ? cause.message : "Could not cancel the booking.",
      );
    }
  };

  const renderGroup = (group: AgendaSessionGroup, index: number) => {
    const sessionInfo = group.session;
    const cancelled = sessionInfo?.status === "cancelled";
    const title = sessionInfo ? formatSessionTimes(sessionInfo) : "Other bookings";
    const key = sessionInfo?.id ?? `unattached-${index}`;

    return (
      <View key={key} className="gap-3">
        <Card style={{ gap: 4 }}>
          <View className="flex-row items-center justify-between gap-3">
            <Text accessibilityRole="header" className="text-base font-semibold text-ink">
              {title}
            </Text>
            {sessionInfo ? (
              <Text className={`text-sm font-semibold ${cancelled ? "text-danger" : "text-ink-muted"}`}>
                {cancelled ? "Cancelled" : `${sessionInfo.bookedCount} / ${sessionInfo.capacity} booked`}
              </Text>
            ) : null}
          </View>
          {sessionInfo?.room ? (
            <Text className="text-sm text-ink-muted" selectable>
              {sessionInfo.room}
            </Text>
          ) : null}
          {cancelled && sessionInfo?.cancelReason ? (
            <Text className="text-sm text-ink-muted" selectable>
              Reason: {sessionInfo.cancelReason}
            </Text>
          ) : null}
          {!cancelled && group.visits.length > 0 ? (
            <Text className="text-sm text-ink-muted">
              Listed in booking order. Patients are seen in order of arrival.
            </Text>
          ) : null}
        </Card>

        {group.visits.length === 0 && !cancelled ? (
          <Text className="px-1 text-sm text-ink-muted">No bookings yet.</Text>
        ) : null}

        {group.visits.map((visit, position) => {
          const canManage = visit.status === "upcoming";
          return (
            <DoctorVisitCard
              key={visit.id}
              appointment={visit}
              beneficiaryName={visit.beneficiaryName}
              dbStatus={visit.dbStatus}
              manageBusy={manageBusyId === visit.id}
              notes={visit.notes}
              position={position + 1}
              proxyTag={visit.proxyTag}
              reason={visit.reason}
              startsAt={visit.startsAt}
              status={visit.status}
              onCancel={canManage ? () => void cancelBooking(visit) : undefined}
              onMarkComplete={
                canManage &&
                visit.dbStatus === "confirmed" &&
                canDoctorMarkVisitComplete(visit.startsAt)
                  ? () => void markSeen(visit)
                  : undefined
              }
            />
          );
        })}

        {group.cancelled.length > 0 ? (
          <Text className="px-1 text-sm text-ink-muted">
            {group.cancelled.length} cancelled{" "}
            {group.cancelled.length === 1 ? "booking" : "bookings"}:{" "}
            {group.cancelled.map((visit) => visit.beneficiaryName).join(", ")}
          </Text>
        ) : null}
      </View>
    );
  };

  return (
    <View className="flex-1 bg-surface-muted">
      <ShellHeader title="Agenda" />

      <View className="flex-row items-center justify-between px-4 pb-2">
        <Pressable
          accessibilityLabel="Previous day"
          accessibilityRole="button"
          className="h-12 w-12 items-center justify-center rounded-full web:hover:bg-surface"
          onPress={() => shiftDay(-1)}
        >
          <ChevronLeft color={colors.ink} size={24} />
        </Pressable>
        <View className="items-center">
          <Text className="text-base font-semibold text-ink">
            {formatAgendaDayLabel(selectedDay)}
          </Text>
          <Text className="text-sm text-ink-muted">
            {isToday ? "Today" : dayYmd}
            {!weekLoading && groups.length > 0
              ? ` · ${bookedToday} ${bookedToday === 1 ? "patient" : "patients"} booked`
              : ""}
          </Text>
        </View>
        <Pressable
          accessibilityLabel="Next day"
          accessibilityRole="button"
          className="h-12 w-12 items-center justify-center rounded-full web:hover:bg-surface"
          onPress={() => shiftDay(1)}
        >
          <ChevronRight color={colors.ink} size={24} />
        </Pressable>
      </View>

      {actionBanner ? (
        <Text accessibilityLiveRegion="polite" className="px-4 pb-2 text-sm text-primary">
          {actionBanner}
        </Text>
      ) : null}

      <RefreshErrorNotice
        className="px-4 pb-2"
        message={refreshError ? errorMessage(refreshError) : null}
      />

      {blockingError ? (
        <View className="flex-1 justify-center px-4">
          <SchedulingStatePanel
            message={errorMessage(blockingError)}
            onRetry={() => void refetchAll()}
          />
        </View>
      ) : initialLoading ? (
        <ScreenLoadingSkeleton>
          <VisitListSkeleton count={3} />
        </ScreenLoadingSkeleton>
      ) : (
        <ScrollView
          contentContainerClassName="gap-5 px-4 pb-8"
          contentInsetAdjustmentBehavior="automatic"
          refreshControl={
            <RefreshControl refreshing={userRefreshing} onRefresh={() => void refresh()} />
          }
        >
          {weekLoading ? (
            <VisitListSkeleton count={3} />
          ) : groups.length === 0 ? (
            <View className="gap-3">
              <EmptyState message="No clinic sessions on this day." />
              <Pressable
                accessibilityLabel="Open schedule to add sessions"
                accessibilityRole="button"
                className="min-h-12 items-center justify-center rounded-xl border border-primary px-4 web:hover:opacity-90"
                onPress={() => router.push("/schedule")}
              >
                <Text className="font-semibold text-primary">Add sessions in Schedule</Text>
              </Pressable>
            </View>
          ) : (
            groups.map(renderGroup)
          )}
        </ScrollView>
      )}
    </View>
  );
}
