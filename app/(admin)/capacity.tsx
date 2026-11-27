import { useState } from "react";
import {
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { format } from "date-fns";

import { CapacityBar } from "@/components/admin/capacity-bar";
import { ShellHeader } from "@/components/shell-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SchedulingStatePanel } from "@/components/ui/scheduling-state-panel";
import {
  ScreenLoadingSkeleton,
  VisitListSkeleton,
} from "@/components/ui/skeleton";
import { RefreshErrorNotice } from "@/components/ui/refresh-error-notice";
import { useCapacity } from "@/lib/queries/sessions";
import { queryKeys } from "@/lib/query/keys";
import { useRefreshOnFocus } from "@/lib/query/use-refresh-on-focus";
import { SchedulingError } from "@/lib/services/scheduling";
import { formatSessionTimes } from "@/lib/session-groups";

function loadErrorMessage(cause: unknown): string {
  return cause instanceof SchedulingError
    ? cause.message
    : "Could not load capacity.";
}

export default function AdminCapacityScreen() {
  const todayYmd = format(new Date(), "yyyy-MM-dd");
  const [userRefreshing, setUserRefreshing] = useState(false);

  const capacityQuery = useCapacity(todayYmd);
  useRefreshOnFocus([queryKeys.sessions.day(todayYmd)]);

  const queries = [capacityQuery];
  const isPending = queries.some((query) => query.isPending);
  // Nothing to show yet: a failed first load replaces the screen.
  const blockingError = queries.find((query) => query.isError && !query.data)?.error;
  // A failed refresh keeps the data already shown.
  const refreshError = queries.find((query) => query.isError && query.data)?.error;

  const rows = capacityQuery.data ?? [];

  const refresh = async () => {
    setUserRefreshing(true);
    try {
      await capacityQuery.refetch();
    } finally {
      setUserRefreshing(false);
    }
  };

  const retry = () => {
    for (const query of queries) {
      if (query.isError) {
        void query.refetch();
      }
    }
  };

  return (
    <View className="flex-1 bg-surface-muted">
      <ShellHeader title="Capacity" />

      {isPending ? (
        <ScreenLoadingSkeleton>
          <VisitListSkeleton count={4} />
        </ScreenLoadingSkeleton>
      ) : blockingError ? (
        <View className="flex-1 justify-center px-4">
          <SchedulingStatePanel
            message={loadErrorMessage(blockingError)}
            onRetry={retry}
          />
        </View>
      ) : (
        <ScrollView
          contentContainerClassName="gap-4 px-4 pb-8 pt-2"
          contentInsetAdjustmentBehavior="automatic"
          refreshControl={
            <RefreshControl
              refreshing={userRefreshing}
              onRefresh={() => void refresh()}
            />
          }
        >
          <RefreshErrorNotice
            message={refreshError ? loadErrorMessage(refreshError) : null}
          />

          <Card style={{ gap: 8 }}>
            <Text className="text-base font-semibold text-ink">Today</Text>
            <Text className="text-sm text-ink-muted" selectable>
              {format(new Date(), "EEEE, MMMM d, yyyy")}
            </Text>
            <Text className="text-sm text-ink-muted">
              Places booked in each clinic session against its patient limit.
            </Text>
          </Card>

          {rows.length === 0 ? (
            <EmptyState message="No doctors to show." />
          ) : (
            rows.map((row) => (
              <Card key={row.doctorId} style={{ gap: 10 }}>
                <View className="flex-row items-center justify-between gap-3">
                  <Text className="min-w-0 flex-1 text-base font-semibold text-ink" selectable>
                    {row.doctorName}
                  </Text>
                  {row.capacity > 0 ? (
                    <Text className="text-sm font-semibold text-ink-muted">
                      {row.booked} / {row.capacity} · {row.bookedPercent}%
                    </Text>
                  ) : null}
                </View>
                {row.sessions.length === 0 ? (
                  <Text className="text-sm text-ink-muted">No session today.</Text>
                ) : (
                  row.sessions.map((session) => (
                    <View key={session.sessionId} className="gap-1">
                      <Text className="text-sm font-medium text-ink">
                        {formatSessionTimes(session)}
                        {session.cancelled ? " · cancelled" : ""}
                      </Text>
                      <CapacityBar
                        bookedPercent={session.bookedPercent}
                        label={
                          session.cancelled
                            ? "Session cancelled"
                            : `${session.booked} of ${session.capacity} places booked`
                        }
                        muted={session.cancelled}
                      />
                    </View>
                  ))
                )}
              </Card>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}
