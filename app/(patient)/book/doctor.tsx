import { useMemo } from "react";
import {
  FlatList,
  Pressable,
  Text,
  View,
} from "react-native";
import { Stack, router } from "expo-router";

import { RefreshErrorNotice } from "@/components/ui/refresh-error-notice";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SchedulingStatePanel } from "@/components/ui/scheduling-state-panel";
import {
  ScreenLoadingSkeleton,
  VisitListSkeleton,
} from "@/components/ui/skeleton";
import { useDoctors } from "@/lib/queries/doctors";
import { formatSessionWhen, placesLeftLabel } from "@/lib/session-groups";
import { useBookingStore } from "@/lib/stores/booking";
import { useSessionStore } from "@/lib/stores/session";
import { SchedulingError } from "@/lib/services/scheduling";

function doctorsErrorMessage(cause: unknown): string {
  return cause instanceof SchedulingError
    ? cause.message
    : "Could not load doctors.";
}

export default function BookDoctorScreen() {
  const session = useSessionStore((state) => state.session);
  const setDoctor = useBookingStore((state) => state.setDoctor);
  const doctorsQuery = useDoctors();
  const doctorRows = doctorsQuery.data;
  const doctors = useMemo(
    () => (doctorRows ?? []).filter((doctor) => doctor.isAcceptingBookings),
    [doctorRows],
  );
  const initialLoading = doctorRows === undefined && doctorsQuery.isPending;
  const blockingError =
    doctorsQuery.isError && doctorRows === undefined ? doctorsQuery.error : null;
  const refreshError = doctorsQuery.isError ? doctorsQuery.error : null;

  if (!session) {
    return null;
  }

  return (
    <>
      <Stack.Screen options={{ title: "Choose a doctor" }} />
      {initialLoading ? (
        <ScreenLoadingSkeleton>
          <VisitListSkeleton count={4} />
        </ScreenLoadingSkeleton>
      ) : blockingError ? (
        <View className="flex-1 justify-center bg-surface-muted px-4">
          <SchedulingStatePanel
            message={doctorsErrorMessage(blockingError)}
            onRetry={() => void doctorsQuery.refetch()}
          />
        </View>
      ) : (
        <FlatList
          className="bg-surface-muted"
          contentContainerClassName="gap-3 px-4 py-4"
          contentInsetAdjustmentBehavior="automatic"
          data={doctors}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={
            refreshError ? (
              <RefreshErrorNotice message={doctorsErrorMessage(refreshError)} />
            ) : undefined
          }
          ListEmptyComponent={
            <EmptyState message="No doctors are accepting bookings right now." />
          }
          renderItem={({ item }) => (
            <Pressable
              accessibilityLabel={`Book with ${item.name}`}
              accessibilityRole="button"
              onPress={() => {
                setDoctor(item.id, item.name);
                router.push("/book/session");
              }}
            >
              <Card style={{ gap: 6 }}>
                <Text className="text-lg font-semibold text-ink">{item.name}</Text>
                <Text className="text-sm text-ink-muted">{item.specialty}</Text>
                <Text className="text-sm text-ink-muted">{item.department}</Text>
                {item.nextSession ? (
                  <Text className="text-sm text-available" selectable>
                    Next session {formatSessionWhen(item.nextSession)} ·{" "}
                    {placesLeftLabel(item.nextSession.placesLeft)}
                  </Text>
                ) : (
                  <Text className="text-sm text-ink-muted">No sessions open right now</Text>
                )}
              </Card>
            </Pressable>
          )}
        />
      )}
    </>
  );
}
