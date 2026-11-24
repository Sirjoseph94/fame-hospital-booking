import { useCallback, useEffect, useRef, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { format, parseISO } from "date-fns";

import * as Linking from "expo-linking";

import { ShellHeader } from "@/components/shell-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SchedulingStatePanel } from "@/components/ui/scheduling-state-panel";
import {
  ScreenLoadingSkeleton,
  VisitListSkeleton,
} from "@/components/ui/skeleton";
import { useNow } from "@/lib/hooks/use-now";
import { telehealthJoinState } from "@/lib/telehealth-join";
import {
  SchedulingError,
  schedulingService,
  type AppointmentListFilter,
} from "@/lib/services/scheduling";
import { visitStatusLabel } from "@/lib/visit-status-label";
import type { Appointment } from "@/types/scheduling";

interface EnrichedAppointment extends Appointment {
  startsAt: string;
  beneficiaryName: string;
  doctorName: string;
  proxyTag?: string;
}

type AppointmentFilter = AppointmentListFilter;

const filters: { id: AppointmentFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "today", label: "Today" },
  { id: "pending", label: "Pending" },
  { id: "confirmed", label: "Confirmed" },
];

const PAGE_SIZE = 50;

export default function AdminAppointmentsScreen() {
  const [rows, setRows] = useState<EnrichedAppointment[]>([]);
  const [filter, setFilter] = useState<AppointmentFilter>("all");
  const [hasMore, setHasMore] = useState(false);
  // Server offset for the next page (rows may skip items without a start time).
  const [nextOffset, setNextOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Re-render every minute so telehealth join windows stay current.
  useNow(60_000);
  const requestIdRef = useRef(0);

  /** Loads page `offset` for the current filter; offset 0 replaces the list. */
  const loadPage = useCallback(
    async (offset: number) => {
      const requestId = ++requestIdRef.current;
      const isStale = () => requestId !== requestIdRef.current;

      setError(null);
      try {
        const page = await schedulingService.listAppointmentsPage({
          filter,
          todayYmd: format(new Date(), "yyyy-MM-dd"),
          offset,
          limit: PAGE_SIZE,
        });
        const contextById = await schedulingService.enrichDoctorAgendaVisits(
          page.items,
        );
        if (isStale()) {
          return;
        }

        const enriched: EnrichedAppointment[] = page.items.flatMap((appointment) => {
          if (!appointment.startsAt) {
            return [];
          }
          const context = contextById.get(appointment.id);
          return [
            {
              ...appointment,
              startsAt: appointment.startsAt,
              beneficiaryName: context?.beneficiaryName ?? "Patient",
              proxyTag: context?.proxyTag,
            },
          ];
        });

        setRows((previous) => (offset === 0 ? enriched : [...previous, ...enriched]));
        setHasMore(page.hasMore);
        setNextOffset(offset + page.items.length);
      } catch (cause) {
        if (isStale()) {
          return;
        }
        setError(
          cause instanceof SchedulingError
            ? cause.message
            : "Could not load appointments.",
        );
      } finally {
        if (!isStale()) {
          setLoading(false);
          setLoadingMore(false);
          setRefreshing(false);
        }
      }
    },
    [filter],
  );

  const load = useCallback(() => loadPage(0), [loadPage]);

  useEffect(() => {
    const task = setTimeout(() => void load(), 0);
    return () => clearTimeout(task);
  }, [load]);

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
                  className={`min-h-11 rounded-full px-4 py-2 ${
                    selected ? "bg-primary" : "border border-ink-muted bg-surface"
                  }`}
                  onPress={() => {
                    if (option.id !== filter) {
                      setLoading(true);
                      setFilter(option.id);
                    }
                  }}
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

          {rows.length === 0 ? (
            <EmptyState message="No appointments match this filter." />
          ) : (
            rows.map((appointment) => {
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
                        {visitStatusLabel(appointment.status, appointment.dbStatus, "admin")}
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

          {hasMore ? (
            <Pressable
              accessibilityLabel="Load more appointments"
              accessibilityRole="button"
              accessibilityState={{ busy: loadingMore }}
              className="min-h-12 items-center justify-center rounded-xl border border-primary px-4 web:hover:opacity-90"
              disabled={loadingMore}
              onPress={() => {
                setLoadingMore(true);
                void loadPage(nextOffset);
              }}
            >
              <Text className="font-semibold text-primary">
                {loadingMore ? "Loading…" : "Load more"}
              </Text>
            </Pressable>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}
