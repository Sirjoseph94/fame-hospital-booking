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
import { useSchedulingSettings } from "@/lib/queries/settings";
import { useCapacity } from "@/lib/queries/slots";
import { queryKeys } from "@/lib/query/keys";
import { useRefreshOnFocus } from "@/lib/query/use-refresh-on-focus";
import { SchedulingError } from "@/lib/services/scheduling";

function loadErrorMessage(cause: unknown): string {
  return cause instanceof SchedulingError
    ? cause.message
    : "Could not load capacity.";
}

export default function AdminCapacityScreen() {
  const todayYmd = format(new Date(), "yyyy-MM-dd");
  const [userRefreshing, setUserRefreshing] = useState(false);

  const capacityQuery = useCapacity(todayYmd);
  const settingsQuery = useSchedulingSettings();
  useRefreshOnFocus([queryKeys.slots.capacityDay(todayYmd), queryKeys.settings]);

  const queries = [capacityQuery, settingsQuery];
  const isPending = queries.some((query) => query.isPending);
  // Nothing to show yet: a failed first load replaces the screen.
  const blockingError = queries.find((query) => query.isError && !query.data)?.error;
  // A failed refresh keeps the data already shown.
  const refreshError = queries.find((query) => query.isError && query.data)?.error;

  const rows = capacityQuery.data ?? [];
  const bufferMinutes = settingsQuery.data?.bufferMinutes ?? 15;

  const refresh = async () => {
    setUserRefreshing(true);
    try {
      await Promise.all([capacityQuery.refetch(), settingsQuery.refetch()]);
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
              Slot mix includes post-visit buffers ({bufferMinutes} min) as
              unavailable time.
            </Text>
            <View className="flex-row flex-wrap gap-4 pt-1">
              <Text className="text-xs text-ink-muted">
                <Text className="font-semibold text-primary">Booked</Text>
              </Text>
              <Text className="text-xs text-ink-muted">
                <Text className="font-semibold text-available">Available</Text>
              </Text>
              <Text className="text-xs text-ink-muted">
                <Text className="font-semibold text-ink-muted">Blackout / held</Text>
              </Text>
            </View>
          </Card>

          {rows.length === 0 ? (
            <EmptyState message="No doctors to show." />
          ) : (
            rows.map((row) => (
              <Card key={row.doctorId} style={{ gap: 10 }}>
                <Text className="text-base font-semibold text-ink" selectable>
                  {row.doctorName}
                </Text>
                <CapacityBar
                  availablePercent={row.availablePercent}
                  blackoutPercent={row.blackoutPercent}
                  bookedPercent={row.bookedPercent}
                  label={`${row.booked} booked · ${row.available} available · ${row.blackout} blackout/held (${row.total} slots today)`}
                />
                <Text className="text-sm text-ink-muted">
                  {row.bookedPercent}% booked · {row.availablePercent}% available ·{" "}
                  {row.blackoutPercent}% unavailable
                </Text>
              </Card>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}
