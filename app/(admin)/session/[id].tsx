import { useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { isToday, parseISO } from "date-fns";
import { router, useLocalSearchParams } from "expo-router";

import { SessionQueue } from "@/components/doctor/session-queue";
import { BackButton } from "@/components/ui/back-button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SchedulingStatePanel } from "@/components/ui/scheduling-state-panel";
import { ScreenLoadingSkeleton, VisitListSkeleton } from "@/components/ui/skeleton";
import { useNow } from "@/lib/hooks/use-now";
import { useSessionQueue } from "@/lib/queries/visit-flow";
import { SchedulingError } from "@/lib/services/scheduling";
import { formatSessionWhen } from "@/lib/session-groups";

function goBack() {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace("/capacity");
  }
}

/** Admin / reception: one session's queue (mark arrivals, call in, no-shows). */
export default function AdminSessionQueueScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  // Re-render every minute so actions unlock as the session opens.
  useNow(60_000);
  const [message, setMessage] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [today, setToday] = useState(true);
  // Polls only while it's today's session (decided once the session loads).
  const queueQuery = useSessionQueue(id, { live: today });
  const data = queueQuery.data;
  const sessionIsToday = data ? isToday(parseISO(data.session.startsAt)) : true;
  if (sessionIsToday !== today) {
    setToday(sessionIsToday);
  }

  const refresh = async () => {
    setRefreshing(true);
    try {
      await queueQuery.refetch();
    } finally {
      setRefreshing(false);
    }
  };

  const liveVisits = (data?.visits ?? []).filter((visit) => visit.status !== "cancelled");

  return (
    <View className="flex-1 bg-surface-muted">
      <View className="flex-row items-center gap-2 px-2 py-3">
        <BackButton iconOnly label="Back to clinics" onPress={goBack} />
        <View className="min-w-0 flex-1">
          <Text accessibilityRole="header" className="text-lg font-bold text-ink" numberOfLines={1}>
            {data?.doctorName ?? "Session"}
          </Text>
          <Text className="text-sm text-ink-muted" numberOfLines={1}>
            {data ? formatSessionWhen(data.session) : "Clinic queue"}
            {data?.session.room ? ` · ${data.session.room}` : ""}
          </Text>
        </View>
      </View>

      {queueQuery.isError && !data ? (
        <View className="flex-1 justify-center px-4">
          <SchedulingStatePanel
            message={queueQuery.error instanceof SchedulingError ? queueQuery.error.message : "Could not load the session."}
            onRetry={() => void queueQuery.refetch()}
          />
        </View>
      ) : !data ? (
        <ScreenLoadingSkeleton>
          <VisitListSkeleton count={3} />
        </ScreenLoadingSkeleton>
      ) : (
        <ScrollView
          contentContainerClassName="gap-4 px-4 pb-8"
          contentInsetAdjustmentBehavior="automatic"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
        >
          <Card style={{ gap: 6 }}>
            <Text className="text-sm text-ink-muted">
              {data.session.status === "cancelled"
                ? "This session was cancelled."
                : today
                  ? "Mark patients without the app as arrived when they reach reception. Arrival order sets the queue."
                  : "Arrivals can be recorded on the day of the session."}
            </Text>
            <Text className="text-sm font-semibold text-ink">
              {data.session.bookedCount} of {data.session.capacity} places booked
              {data.session.waitlistCount > 0 ? ` · ${data.session.waitlistCount} on the waitlist` : ""}
            </Text>
          </Card>
          {message ? (
            <Text accessibilityLiveRegion="polite" className="px-1 text-sm text-primary">
              {message}
            </Text>
          ) : null}
          {liveVisits.length === 0 ? (
            <EmptyState message="No bookings in this session." />
          ) : (
            <SessionQueue audience="admin" session={data.session} visits={liveVisits} onMessage={setMessage} />
          )}
        </ScrollView>
      )}
    </View>
  );
}
