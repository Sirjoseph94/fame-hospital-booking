import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { format, isToday, parseISO } from "date-fns";

import * as Linking from "expo-linking";

import { ShellHeader } from "@/components/shell-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SchedulingStatePanel } from "@/components/ui/scheduling-state-panel";
import {
  ScreenLoadingSkeleton,
  VisitListSkeleton,
} from "@/components/ui/skeleton";
import { telehealthJoinState } from "@/lib/telehealth-join";
import {
  SchedulingError,
  schedulingService,
} from "@/lib/services/scheduling";
import type {
  Appointment,
  AppointmentDbStatus,
  AppointmentStatus,
} from "@/types/scheduling";

interface EnrichedAppointment extends Appointment {
  startsAt: string;
  beneficiaryName: string;
  doctorName: string;
  proxyTag?: string;
}

type AppointmentFilter = "all" | "today" | "pending" | "confirmed";

const filters: { id: AppointmentFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "today", label: "Today" },
  { id: "pending", label: "Pending" },
  { id: "confirmed", label: "Confirmed" },
];

function statusLabel(
  status: AppointmentStatus,
  dbStatus: AppointmentDbStatus,
): string {
  if (status === "completed") {
    return "Completed";
  }
  if (status === "cancelled") {
    return "Cancelled";
  }
  if (dbStatus === "pending") {
    return "Pending";
  }
  if (dbStatus === "confirmed") {
    return "Confirmed";
  }
  return "Upcoming";
}

export default function AdminAppointmentsScreen() {
  const [rows, setRows] = useState<EnrichedAppointment[]>([]);
  const [filter, setFilter] = useState<AppointmentFilter>("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, setJoinTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setJoinTick((value) => value + 1), 60_000);
    return () => clearInterval(timer);
  }, []);

  const load = useCallback(async () => {
    setError(null);
    try {
      const appointments = await schedulingService.listAllAppointments();
      const [doctors, contextById] = await Promise.all([
        schedulingService.listDoctors(),
        schedulingService.enrichDoctorAgendaVisits(appointments),
      ]);

      const doctorNameById = new Map(doctors.map((doctor) => [doctor.id, doctor.name]));

      const enriched: EnrichedAppointment[] = appointments.flatMap((appointment) => {
        if (!appointment.startsAt) {
          return [];
        }
        const context = contextById.get(appointment.id);
        return [
          {
            ...appointment,
            startsAt: appointment.startsAt,
            beneficiaryName: context?.beneficiaryName ?? "Patient",
            doctorName: doctorNameById.get(appointment.doctorId) ?? "Doctor",
            proxyTag: context?.proxyTag,
          },
        ];
      });

      setRows(enriched);
    } catch (cause) {
      setError(
        cause instanceof SchedulingError
          ? cause.message
          : "Could not load appointments.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const task = setTimeout(() => void load(), 0);
    return () => clearTimeout(task);
  }, [load]);

  const filtered = useMemo(() => {
    const sorted = [...rows].sort(
      (left, right) =>
        parseISO(right.startsAt).getTime() - parseISO(left.startsAt).getTime(),
    );
    if (filter === "all") {
      return sorted;
    }
    if (filter === "today") {
      return sorted.filter((row) => isToday(parseISO(row.startsAt)));
    }
    if (filter === "pending") {
      return sorted.filter((row) => row.dbStatus === "pending");
    }
    return sorted.filter((row) => row.dbStatus === "confirmed");
  }, [filter, rows]);

  return (
    <View className="flex-1 bg-surface-muted">
      <ShellHeader title="Appointments" />

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
          contentContainerClassName="gap-3 px-4 pb-8 pt-2"
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
          <View className="flex-row flex-wrap gap-2">
            {filters.map((option) => {
              const selected = filter === option.id;
              return (
                <Pressable
                  key={option.id}
                  accessibilityLabel={`Filter ${option.label}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  className={`min-h-10 rounded-full px-4 py-2 ${
                    selected ? "bg-primary" : "border border-ink-muted bg-surface"
                  }`}
                  onPress={() => setFilter(option.id)}
                >
                  <Text
                    className={`text-sm font-semibold ${
                      selected ? "text-surface" : "text-ink-muted"
                    }`}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {filtered.length === 0 ? (
            <EmptyState message="No appointments match this filter." />
          ) : (
            filtered.map((appointment) => {
              const when = format(parseISO(appointment.startsAt), "EEE, MMM d · h:mm a");
              const join =
                appointment.type === "telehealth" &&
                appointment.status === "upcoming"
                  ? telehealthJoinState(appointment.startsAt)
                  : { showJoin: false, label: "" };
              return (
                <Card key={appointment.id} style={{ gap: 8 }}>
                  <View className="flex-row items-start justify-between gap-3">
                    <View className="min-w-0 flex-1 gap-1">
                      <Text className="text-base font-semibold text-ink" selectable>
                        {appointment.beneficiaryName}
                      </Text>
                      <Text className="text-sm text-ink-muted" selectable>
                        {appointment.doctorName}
                      </Text>
                    </View>
                    <View className="rounded-full bg-surface-muted px-3 py-1">
                      <Text className="text-xs font-semibold uppercase text-ink-muted">
                        {statusLabel(appointment.status, appointment.dbStatus)}
                      </Text>
                    </View>
                  </View>
                  <Text className="text-sm text-ink" selectable>
                    {when}
                  </Text>
                  <Text className="text-sm text-ink-muted">{appointment.type}</Text>
                  {appointment.proxyTag ? (
                    <Text className="text-sm text-ink-muted" selectable>
                      {appointment.proxyTag}
                    </Text>
                  ) : null}
                  {join.showJoin ? (
                    <Pressable
                      accessibilityLabel={join.label}
                      accessibilityRole="button"
                      className="min-h-12 items-center justify-center rounded-xl border border-primary px-4 web:hover:opacity-90"
                      onPress={() => {
                        const url = appointment.videoUrl;
                        if (url) {
                          void Linking.openURL(url);
                        }
                      }}
                    >
                      <Text className="font-semibold text-primary">{join.label}</Text>
                    </Pressable>
                  ) : null}
                </Card>
              );
            })
          )}
        </ScrollView>
      )}
    </View>
  );
}
