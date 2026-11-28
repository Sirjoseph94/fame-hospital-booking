import { useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { format, parseISO, subDays } from "date-fns";

import { ShellHeader } from "@/components/shell-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { RefreshErrorNotice } from "@/components/ui/refresh-error-notice";
import { SchedulingStatePanel } from "@/components/ui/scheduling-state-panel";
import { ScreenLoadingSkeleton, VisitListSkeleton } from "@/components/ui/skeleton";
import { useAdminBack } from "@/lib/hooks/use-admin-back";
import { useBreakpoint } from "@/lib/platform";
import { useVisitReport } from "@/lib/queries/visit-flow";
import { noShowRate, type VisitReport } from "@/lib/services/reports";

const RANGES = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
] as const;

function minutes(value: number | null): string {
  if (value === null) return "–";
  const total = Math.round(value);
  if (total < 60) return `${total} min`;
  return `${Math.floor(total / 60)} h ${total % 60} min`;
}

function Stat({ label, value, hint, tone = "text-ink" }: { label: string; value: string; hint?: string; tone?: string }) {
  return (
    <View accessibilityLabel={`${label}: ${value}${hint ? `, ${hint}` : ""}`} className="min-w-[45%] flex-1 rounded-xl bg-surface-muted p-3">
      <Text className={`text-2xl font-bold ${tone}`}>{value}</Text>
      <Text className="text-sm font-medium text-ink">{label}</Text>
      {hint ? <Text className="text-xs text-ink-muted">{hint}</Text> : null}
    </View>
  );
}

/** Daily attended vs missed, as simple horizontal bars (largest day = full width). */
function DayBars({ days }: { days: VisitReport["days"] }) {
  const max = Math.max(1, ...days.map((day) => day.seen + day.noShow));
  const shown = days.filter((day) => day.booked > 0).slice(-14);
  if (shown.length === 0) return null;
  return (
    <View className="gap-2">
      {shown.map((day) => (
        <View
          key={day.dateYmd}
          accessibilityLabel={`${format(parseISO(day.dateYmd), "EEEE d MMMM")}: ${day.seen} seen, ${day.noShow} no-shows, ${day.booked} booked`}
          className="flex-row items-center gap-3"
        >
          <Text className="w-20 text-xs text-ink-muted">{format(parseISO(day.dateYmd), "EEE d MMM")}</Text>
          <View className="h-3 min-w-0 flex-1 flex-row overflow-hidden rounded-full bg-surface-muted">
            {day.seen > 0 ? <View className="h-full bg-available" style={{ width: `${(day.seen / max) * 100}%` }} /> : null}
            {day.noShow > 0 ? <View className="h-full bg-danger" style={{ width: `${(day.noShow / max) * 100}%` }} /> : null}
          </View>
          <Text className="w-14 text-right text-xs text-ink-muted">
            {day.seen}/{day.booked}
          </Text>
        </View>
      ))}
      <View className="flex-row gap-4 pt-1">
        <View className="flex-row items-center gap-1">
          <View className="h-2.5 w-2.5 rounded-full bg-available" />
          <Text className="text-xs text-ink-muted">Seen</Text>
        </View>
        <View className="flex-row items-center gap-1">
          <View className="h-2.5 w-2.5 rounded-full bg-danger" />
          <Text className="text-xs text-ink-muted">No-show</Text>
        </View>
        <Text className="text-xs text-ink-muted">Right: seen / booked</Text>
      </View>
    </View>
  );
}

/** Admin: attendance, no-shows and waiting times. */
export default function AdminReportsScreen() {
  const onBack = useAdminBack();
  const isWide = useBreakpoint() !== "phone";
  const [rangeDays, setRangeDays] = useState<number>(30);
  const [refreshing, setRefreshing] = useState(false);
  const { fromYmd, toYmd } = useMemo(() => {
    const today = new Date();
    return {
      fromYmd: format(subDays(today, rangeDays - 1), "yyyy-MM-dd"),
      toYmd: format(today, "yyyy-MM-dd"),
    };
  }, [rangeDays]);
  const reportQuery = useVisitReport(fromYmd, toYmd);
  const report = reportQuery.data;

  const refresh = async () => {
    setRefreshing(true);
    try {
      await reportQuery.refetch();
    } finally {
      setRefreshing(false);
    }
  };

  const rate = report ? noShowRate(report.totals) : null;

  return (
    <View className="flex-1 bg-surface-muted">
      <ShellHeader onBack={onBack} title="Reports" />
      <View accessibilityRole="tablist" className="flex-row gap-2 px-4 pb-2">
        {RANGES.map((range) => {
          const selected = range.days === rangeDays;
          return (
            <Pressable
              key={range.days}
              accessibilityLabel={`Last ${range.label}`}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              className={[
                "min-h-11 flex-1 items-center justify-center rounded-xl border px-2 web:hover:opacity-90",
                selected ? "border-primary bg-primary" : "border-ink-muted bg-surface",
              ].join(" ")}
              onPress={() => setRangeDays(range.days)}
            >
              <Text className={`text-sm font-semibold ${selected ? "text-surface" : "text-ink"}`}>
                Last {range.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {reportQuery.isPending ? (
        <ScreenLoadingSkeleton>
          <VisitListSkeleton count={3} />
        </ScreenLoadingSkeleton>
      ) : reportQuery.isError && !report ? (
        <View className="flex-1 justify-center px-4">
          <SchedulingStatePanel
            message={reportQuery.error instanceof Error ? reportQuery.error.message : "Could not load the report."}
            onRetry={() => void reportQuery.refetch()}
          />
        </View>
      ) : report ? (
        <ScrollView
          contentContainerClassName="gap-4 px-4 pb-8 pt-2"
          contentInsetAdjustmentBehavior="automatic"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
        >
          <RefreshErrorNotice message={reportQuery.isError ? "Could not refresh the report." : null} />
          <Text className="px-1 text-sm text-ink-muted">
            {format(parseISO(fromYmd), "d MMM")} – {format(parseISO(toYmd), "d MMM yyyy")}, by visit date. Clinic-session bookings only.
          </Text>

          {report.totals.booked + report.totals.cancelled === 0 ? (
            <EmptyState message="No bookings in this period yet." />
          ) : (
            <>
              <Card style={{ gap: 10 }}>
                <Text accessibilityRole="header" className="text-base font-semibold text-ink">
                  Attendance
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  <Stat label="Booked" value={String(report.totals.booked)} hint={`${report.totals.upcoming} still upcoming`} />
                  <Stat label="Seen" tone="text-available" value={String(report.totals.seen)} />
                  <Stat
                    hint="of visits that are over"
                    label="No-show rate"
                    tone={rate !== null && rate >= 15 ? "text-danger" : "text-ink"}
                    value={rate === null ? "–" : `${rate}%`}
                  />
                  <Stat label="Cancelled" value={String(report.totals.cancelled)} />
                </View>
              </Card>

              <Card style={{ gap: 10 }}>
                <Text accessibilityRole="header" className="text-base font-semibold text-ink">
                  Waiting times
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  <Stat hint="check-in to being called" label="Average wait" value={minutes(report.totals.avgWaitMinutes)} />
                  <Stat hint="called in to marked seen" label="Average visit" value={minutes(report.totals.avgVisitMinutes)} />
                </View>
                {report.totals.avgWaitMinutes === null ? (
                  <Text className="text-xs text-ink-muted">
                    Waiting times appear once patients check in and doctors call them in from the queue.
                  </Text>
                ) : null}
              </Card>

              <View className={isWide ? "flex-row items-start gap-4" : "gap-4"}>
                <View className={isWide ? "min-w-0 flex-1" : ""}>
                  <Card style={{ gap: 10 }}>
                    <Text accessibilityRole="header" className="text-base font-semibold text-ink">
                      By doctor
                    </Text>
                    {report.doctors.map((doctor) => {
                      const doctorRate = noShowRate(doctor);
                      return (
                        <View key={doctor.doctorId} className="gap-0.5 border-t border-surface-muted pt-2">
                          <Text className="text-sm font-semibold text-ink">{doctor.name}</Text>
                          <Text className="text-sm text-ink-muted">
                            {doctor.booked} booked · {doctor.seen} seen · {doctor.noShow} no-show
                            {doctorRate !== null ? ` (${doctorRate}%)` : ""} · avg wait {minutes(doctor.avgWaitMinutes)}
                          </Text>
                        </View>
                      );
                    })}
                  </Card>
                </View>
                <View className={isWide ? "min-w-0 flex-1" : ""}>
                  <Card style={{ gap: 10 }}>
                    <Text accessibilityRole="header" className="text-base font-semibold text-ink">
                      By day
                    </Text>
                    <DayBars days={report.days} />
                  </Card>
                </View>
              </View>
            </>
          )}
        </ScrollView>
      ) : null}
    </View>
  );
}
