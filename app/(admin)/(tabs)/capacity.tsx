import { useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { addDays, format, isToday, parseISO, startOfDay, subDays } from "date-fns";
import { router } from "expo-router";
import { ChevronLeft, ChevronRight, ListOrdered } from "lucide-react-native";

import { CapacityBar } from "@/components/admin/capacity-bar";
import { SessionProgressChips, sumProgress } from "@/components/admin/session-progress-chips";
import { ShellHeader } from "@/components/shell-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { RefreshErrorNotice } from "@/components/ui/refresh-error-notice";
import { SchedulingStatePanel } from "@/components/ui/scheduling-state-panel";
import { ScreenLoadingSkeleton, VisitListSkeleton } from "@/components/ui/skeleton";
import { useCapacity } from "@/lib/queries/sessions";
import { useSessionProgress } from "@/lib/queries/visit-flow";
import { queryKeys } from "@/lib/query/keys";
import { useRefreshOnFocus } from "@/lib/query/use-refresh-on-focus";
import { SchedulingError } from "@/lib/services/scheduling";
import { formatSessionTimes } from "@/lib/session-groups";
import { colors } from "@/lib/theme-colors";

function loadErrorMessage(cause: unknown): string {
  return cause instanceof SchedulingError ? cause.message : "Could not load clinics.";
}

/** Admin: each doctor's clinics on a day, how full they are and how they're going. */
export default function AdminClinicsScreen() {
  const [day, setDay] = useState(() => startOfDay(new Date()));
  const dateYmd = format(day, "yyyy-MM-dd");
  const today = isToday(day);
  const [userRefreshing, setUserRefreshing] = useState(false);

  const capacityQuery = useCapacity(dateYmd);
  const progressQuery = useSessionProgress(dateYmd, { live: today });
  useRefreshOnFocus([queryKeys.sessions.day(dateYmd), queryKeys.sessionProgress(dateYmd)]);

  const rows = capacityQuery.data ?? [];
  const progressById = useMemo(
    () => new Map((progressQuery.data ?? []).map((row) => [row.sessionId, row])),
    [progressQuery.data],
  );
  const dayTotals = useMemo(
    () => sumProgress((progressQuery.data ?? []).filter((row) => row.status === "scheduled")),
    [progressQuery.data],
  );
  const hasSessions = rows.some((row) => row.sessions.length > 0);

  const blockingError = capacityQuery.isError && !capacityQuery.data ? capacityQuery.error : null;
  const refreshError =
    (capacityQuery.isError && capacityQuery.data ? capacityQuery.error : null) ??
    (progressQuery.isError ? progressQuery.error : null);

  const refresh = async () => {
    setUserRefreshing(true);
    try {
      await Promise.all([capacityQuery.refetch(), progressQuery.refetch()]);
    } finally {
      setUserRefreshing(false);
    }
  };

  return (
    <View className="flex-1 bg-surface-muted">
      <ShellHeader title="Clinics" />

      <View className="flex-row items-center justify-between px-4 pb-2">
        <Pressable
          accessibilityLabel="Previous day"
          accessibilityRole="button"
          className="h-12 w-12 items-center justify-center rounded-full web:hover:bg-surface active:opacity-70"
          onPress={() => setDay((current) => subDays(current, 1))}
        >
          <ChevronLeft color={colors.ink} size={24} />
        </Pressable>
        <View className="items-center">
          <Text className="text-base font-semibold text-ink">{format(day, "EEEE, MMM d")}</Text>
          {today ? (
            <Text className="text-sm text-ink-muted">Today · updates live</Text>
          ) : (
            <Pressable
              accessibilityLabel="Go to today"
              accessibilityRole="button"
              className="min-h-11 justify-center px-2"
              onPress={() => setDay(startOfDay(new Date()))}
            >
              <Text className="text-sm font-semibold text-primary">Back to today</Text>
            </Pressable>
          )}
        </View>
        <Pressable
          accessibilityLabel="Next day"
          accessibilityRole="button"
          className="h-12 w-12 items-center justify-center rounded-full web:hover:bg-surface active:opacity-70"
          onPress={() => setDay((current) => addDays(current, 1))}
        >
          <ChevronRight color={colors.ink} size={24} />
        </Pressable>
      </View>

      {capacityQuery.isPending ? (
        <ScreenLoadingSkeleton>
          <VisitListSkeleton count={4} />
        </ScreenLoadingSkeleton>
      ) : blockingError ? (
        <View className="flex-1 justify-center px-4">
          <SchedulingStatePanel message={loadErrorMessage(blockingError)} onRetry={() => void capacityQuery.refetch()} />
        </View>
      ) : (
        <ScrollView
          contentContainerClassName="gap-4 px-4 pb-8 pt-2"
          contentInsetAdjustmentBehavior="automatic"
          refreshControl={<RefreshControl refreshing={userRefreshing} onRefresh={() => void refresh()} />}
        >
          <RefreshErrorNotice message={refreshError ? loadErrorMessage(refreshError) : null} />

          {hasSessions ? (
            <Card style={{ gap: 10 }}>
              <Text accessibilityRole="header" className="text-base font-semibold text-ink">
                {today ? "Today so far" : "Day summary"}
              </Text>
              <SessionProgressChips progress={dayTotals} />
            </Card>
          ) : null}

          {rows.length === 0 ? (
            <EmptyState message="No doctors to show." />
          ) : (
            rows.map((row) => (
              <Card key={row.doctorId} style={{ gap: 12 }}>
                <View className="flex-row items-center justify-between gap-3">
                  <Text className="min-w-0 flex-1 text-base font-semibold text-ink" selectable>
                    {row.doctorName}
                  </Text>
                  {row.capacity > 0 ? (
                    <Text className="text-sm font-semibold text-ink-muted">
                      {row.booked} / {row.capacity} booked
                    </Text>
                  ) : null}
                </View>
                {row.sessions.length === 0 ? (
                  <Text className="text-sm text-ink-muted">No clinic this day.</Text>
                ) : (
                  row.sessions.map((session) => {
                    const progress = progressById.get(session.sessionId);
                    return (
                      <View key={session.sessionId} className="gap-2 border-t border-surface-muted pt-3">
                        <View className="flex-row items-center justify-between gap-2">
                          <Text className="min-w-0 flex-1 text-sm font-semibold text-ink">
                            {formatSessionTimes(session)}
                            {session.cancelled ? " · cancelled" : ""}
                          </Text>
                          {!session.cancelled ? (
                            <Pressable
                              accessibilityLabel={`Open queue for ${row.doctorName}, ${formatSessionTimes(session)}`}
                              accessibilityRole="button"
                              className="min-h-11 flex-row items-center gap-1 rounded-lg px-2 web:hover:bg-surface-muted active:opacity-70"
                              onPress={() =>
                                router.push({ pathname: "/session/[id]", params: { id: session.sessionId } })
                              }
                            >
                              <ListOrdered color={colors.primary} size={18} />
                              <Text className="text-sm font-semibold text-primary">Open queue</Text>
                            </Pressable>
                          ) : null}
                        </View>
                        <CapacityBar
                          bookedPercent={session.bookedPercent}
                          label={
                            session.cancelled
                              ? "Session cancelled"
                              : `${session.booked} of ${session.capacity} places booked`
                          }
                          muted={session.cancelled}
                        />
                        {progress && !session.cancelled && progress.booked > 0 ? (
                          <SessionProgressChips progress={progress} />
                        ) : null}
                      </View>
                    );
                  })
                )}
              </Card>
            ))
          )}
          {!today && parseISO(`${dateYmd}T23:59:59`) < new Date() ? (
            <Text className="px-1 text-xs text-ink-muted">
              Past days show final counts. No-shows are recorded automatically after each session if that&apos;s turned on in Settings.
            </Text>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}
