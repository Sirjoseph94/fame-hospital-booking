import { useCallback, useEffect, useState } from "react";
import {
  FlatList,
  Pressable,
  Text,
  View,
} from "react-native";
import { Stack, router } from "expo-router";
import { format, parseISO } from "date-fns";

import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SchedulingStatePanel } from "@/components/ui/scheduling-state-panel";
import {
  ScreenLoadingSkeleton,
  VisitListSkeleton,
} from "@/components/ui/skeleton";
import { useBookingStore } from "@/lib/stores/booking";
import { useSessionStore } from "@/lib/stores/session";
import {
  SchedulingError,
  schedulingService,
} from "@/lib/services/scheduling";
import type { Doctor } from "@/types/scheduling";

export default function BookDoctorScreen() {
  const session = useSessionStore((state) => state.session);
  const setDoctor = useBookingStore((state) => state.setDoctor);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const rows = await schedulingService.listDoctors();
      setDoctors(rows.filter((doctor) => doctor.isAcceptingBookings));
    } catch (cause) {
      const message =
        cause instanceof SchedulingError
          ? cause.message
          : "Could not load doctors.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const task = setTimeout(() => void load(), 0);
    return () => clearTimeout(task);
  }, [load]);

  if (!session) {
    return null;
  }

  return (
    <>
      <Stack.Screen options={{ title: "Choose a doctor" }} />
      {loading ? (
        <ScreenLoadingSkeleton>
          <VisitListSkeleton count={4} />
        </ScreenLoadingSkeleton>
      ) : error ? (
        <View className="flex-1 justify-center bg-surface-muted px-4">
          <SchedulingStatePanel message={error} onRetry={() => void load()} />
        </View>
      ) : (
        <FlatList
          className="bg-surface-muted"
          contentContainerClassName="gap-3 px-4 py-4"
          contentInsetAdjustmentBehavior="automatic"
          data={doctors}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
            <EmptyState message="No doctors are accepting bookings right now." />
          }
          renderItem={({ item }) => (
            <Pressable
              accessibilityLabel={`Book with ${item.name}`}
              accessibilityRole="button"
              onPress={() => {
                setDoctor(item.id, item.name);
                router.push("/book/slot");
              }}
            >
              <Card style={{ gap: 6 }}>
                <Text className="text-lg font-semibold text-ink">{item.name}</Text>
                <Text className="text-sm text-ink-muted">{item.specialty}</Text>
                <Text className="text-sm text-ink-muted">{item.department}</Text>
                {item.nextAvailable ? (
                  <Text className="text-sm text-available" selectable>
                    Next available{" "}
                    {format(parseISO(item.nextAvailable), "EEE, MMM d · h:mm a")}
                  </Text>
                ) : (
                  <Text className="text-sm text-ink-muted">No open slots right now</Text>
                )}
              </Card>
            </Pressable>
          )}
        />
      )}
    </>
  );
}
