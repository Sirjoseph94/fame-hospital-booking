import { useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";

import { MoveSessionSheet } from "@/components/patient/move-session-sheet";
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
import { useNow } from "@/lib/hooks/use-now";
import {
  useAdminAppointments,
  useCancelAppointment,
  type AdminAppointmentRow,
} from "@/lib/queries/appointments";
import { queryKeys } from "@/lib/query/keys";
import { useRefreshOnFocus } from "@/lib/query/use-refresh-on-focus";
import { formatSessionWhen } from "@/lib/session-groups";
import {
  SchedulingError,
  type AppointmentListFilter,
} from "@/lib/services/scheduling";
import { visitStatusLabel } from "@/lib/visit-status-label";

type AppointmentFilter = AppointmentListFilter;

const filters: { id: AppointmentFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "today", label: "Today" },
  { id: "upcoming", label: "Upcoming" },
  { id: "missed", label: "No-shows" },
  { id: "cancelled", label: "Cancelled" },
];

function loadErrorMessage(cause: unknown): string {
  return cause instanceof SchedulingError
    ? cause.message
    : "Could not load appointments.";
}

export default function AdminAppointmentsScreen() {
  const [filter, setFilter] = useState<AppointmentFilter>("all");
  const [userRefreshing, setUserRefreshing] = useState(false);
  const [moveTarget, setMoveTarget] = useState<AdminAppointmentRow | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const cancelMutation = useCancelAppointment();
  // Actions disappear once a visit's session has ended.
  const now = useNow(60_000);

  // Each filter has its own cache entry, so switching filters never shows
  // another filter's rows (or a late response for one).
  const appointmentsQuery = useAdminAppointments(filter);
  useRefreshOnFocus([queryKeys.appointments.admin(filter)]);

  const rows = appointmentsQuery.data?.pages.flatMap((page) => page.rows) ?? [];
  const { hasNextPage, isFetchingNextPage } = appointmentsQuery;
  // A failed refresh or "Load more" keeps the rows already shown.
  const inlineError =
    appointmentsQuery.isError && appointmentsQuery.data
      ? loadErrorMessage(appointmentsQuery.error)
      : null;

  const cancelBooking = async (appointment: AdminAppointmentRow) => {
    const confirmed = await confirmAsync({
      title: "Cancel this booking?",
      message: `${appointment.beneficiaryName} with ${appointment.doctorName}, ${formatSessionWhen(appointment)}. The patient will be notified.`,
      confirmText: "Cancel booking",
      cancelText: "Keep booking",
      destructive: true,
    });
    if (!confirmed) {
      return;
    }
    setBanner(null);
    try {
      await cancelMutation.mutateAsync(appointment.id);
      setBanner(`Cancelled ${appointment.beneficiaryName}'s booking.`);
    } catch (cause) {
      showAlert(
        "Cancel failed",
        cause instanceof SchedulingError ? cause.message : "Could not cancel the booking.",
      );
    }
  };

  const refresh = async () => {
    setUserRefreshing(true);
    try {
      await appointmentsQuery.refetch();
    } finally {
      setUserRefreshing(false);
    }
  };

  return (
    <View className="flex-1 bg-surface-muted">
      <ShellHeader title="Appointments" />

      {appointmentsQuery.isPending ? (
        <ScreenLoadingSkeleton>
          <VisitListSkeleton count={4} />
        </ScreenLoadingSkeleton>
      ) : appointmentsQuery.isError && !appointmentsQuery.data ? (
        <View className="flex-1 justify-center px-4">
          <SchedulingStatePanel
            message={loadErrorMessage(appointmentsQuery.error)}
            onRetry={() => void appointmentsQuery.refetch()}
          />
        </View>
      ) : (
        <ScrollView
          contentContainerClassName="gap-3 px-4 pb-8 pt-2"
          contentInsetAdjustmentBehavior="automatic"
          refreshControl={
            <RefreshControl
              refreshing={userRefreshing}
              onRefresh={() => void refresh()}
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

          <RefreshErrorNotice message={inlineError} />
          {banner ? (
            <Text accessibilityLiveRegion="polite" className="text-sm text-primary">
              {banner}
            </Text>
          ) : null}

          {rows.length === 0 ? (
            <EmptyState message="No appointments match this filter." />
          ) : (
            rows.map((appointment) => {
              const when = formatSessionWhen(appointment);
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
                        {visitStatusLabel(
                          appointment.status,
                          appointment.dbStatus,
                          "admin",
                          appointment.startsAt,
                          new Date(now),
                          appointment,
                        )}
                      </Text>
                    </View>
                  </View>
                  <Text className="text-sm text-ink" selectable>
                    {when}
                  </Text>
                  {appointment.proxyTag ? (
                    <Text className="text-sm text-ink-muted" selectable>
                      {appointment.proxyTag}
                    </Text>
                  ) : null}
                  {appointment.status === "upcoming" &&
                  new Date(appointment.endsAt).getTime() > now ? (
                    <View className="flex-row flex-wrap gap-2 border-t border-surface-muted pt-3">
                      {appointment.sessionId ? (
                        <Pressable
                          accessibilityLabel={`Change session for ${appointment.beneficiaryName}`}
                          accessibilityRole="button"
                          className="min-h-11 flex-1 items-center justify-center rounded-xl border border-primary px-3 web:hover:opacity-90"
                          onPress={() => setMoveTarget(appointment)}
                        >
                          <Text className="text-sm font-semibold text-primary">Change session</Text>
                        </Pressable>
                      ) : null}
                      <Pressable
                        accessibilityLabel={`Cancel booking for ${appointment.beneficiaryName}`}
                        accessibilityRole="button"
                        accessibilityState={{
                          busy: cancelMutation.isPending && cancelMutation.variables === appointment.id,
                        }}
                        className="min-h-11 flex-1 items-center justify-center rounded-xl border border-ink-muted px-3 web:hover:opacity-90"
                        disabled={cancelMutation.isPending}
                        onPress={() => void cancelBooking(appointment)}
                      >
                        <Text className="text-sm font-semibold text-ink-muted">Cancel</Text>
                      </Pressable>
                    </View>
                  ) : null}
                </Card>
              );
            })
          )}

          {hasNextPage ? (
            <Pressable
              accessibilityLabel="Load more appointments"
              accessibilityRole="button"
              accessibilityState={{ busy: isFetchingNextPage }}
              className="min-h-12 items-center justify-center rounded-xl border border-primary px-4 web:hover:opacity-90"
              disabled={isFetchingNextPage}
              onPress={() => void appointmentsQuery.fetchNextPage()}
            >
              <Text className="font-semibold text-primary">
                {isFetchingNextPage ? "Loading…" : "Load more"}
              </Text>
            </Pressable>
          ) : null}
        </ScrollView>
      )}

      {moveTarget ? (
        <MoveSessionSheet
          key={moveTarget.id}
          appointmentId={moveTarget.id}
          currentSessionId={moveTarget.sessionId}
          doctorId={moveTarget.doctorId}
          doctorName={moveTarget.doctorName}
          open
          onOpenChange={(open) => {
            if (!open) {
              setMoveTarget(null);
            }
          }}
          onMoved={() => setBanner(`Moved ${moveTarget.beneficiaryName}'s booking.`)}
        />
      ) : null}
    </View>
  );
}
