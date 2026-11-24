import { useCallback, useEffect, useState } from "react";
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
import { buildCapacityRow, type DoctorCapacityRow } from "@/lib/admin-capacity";
import {
  SchedulingError,
  schedulingService,
} from "@/lib/services/scheduling";

export default function AdminCapacityScreen() {
  const todayYmd = format(new Date(), "yyyy-MM-dd");
  const [rows, setRows] = useState<DoctorCapacityRow[]>([]);
  const [bufferMinutes, setBufferMinutes] = useState(15);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [doctors, settings] = await Promise.all([
        schedulingService.listDoctors(),
        schedulingService.getSettings(),
      ]);
      setBufferMinutes(settings.bufferMinutes);

      // One round trip for every doctor's slots (was ~4 requests per doctor).
      const slotsByDoctor = await schedulingService.listSlotsOnDateForDoctors(
        doctors.map((doctor) => doctor.id),
        todayYmd,
      );
      const capacityRows = doctors.map((doctor) =>
        buildCapacityRow(doctor, slotsByDoctor.get(doctor.id) ?? []),
      );

      setRows(
        capacityRows.sort((left, right) =>
          left.doctorName.localeCompare(right.doctorName),
        ),
      );
    } catch (cause) {
      setError(
        cause instanceof SchedulingError
          ? cause.message
          : "Could not load capacity.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [todayYmd]);

  useEffect(() => {
    const task = setTimeout(() => void load(), 0);
    return () => clearTimeout(task);
  }, [load]);

  return (
    <View className="flex-1 bg-surface-muted">
      <ShellHeader title="Capacity" />

      {loading ? (
        <ScreenLoadingSkeleton>
          <VisitListSkeleton count={4} />
        </ScreenLoadingSkeleton>
      ) : error ? (
        <View className="flex-1 justify-center px-4">
          <SchedulingStatePanel message={error} onRetry={() => void load()} />
        </View>
      ) : (
        <ScrollView
          contentContainerClassName="gap-4 px-4 pb-8 pt-2"
          contentInsetAdjustmentBehavior="automatic"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void load();
              }}
            />
          }
        >
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
