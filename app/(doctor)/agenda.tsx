import { useCallback, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import * as Linking from "expo-linking";
import {
  addDays,
  endOfWeek,
  format,
  startOfDay,
  startOfWeek,
  subDays,
} from "date-fns";
import { router, useFocusEffect } from "expo-router";
import { ChevronLeft, ChevronRight } from "lucide-react-native";

import { ConfirmVisitSheet } from "@/components/doctor/confirm-visit-sheet";
import { PostVisitBufferCard } from "@/components/doctor/post-visit-buffer-card";
import { DoctorVisitCard } from "@/components/doctor/doctor-visit-card";
import { RescheduleSheet } from "@/components/patient/reschedule-sheet";
import { ShellHeader } from "@/components/shell-header";
import { EmptyState } from "@/components/ui/empty-state";
import { SchedulingStatePanel } from "@/components/ui/scheduling-state-panel";
import {
  ScreenLoadingSkeleton,
  VisitListSkeleton,
} from "@/components/ui/skeleton";
import { confirmAsync, showAlert } from "@/lib/confirm";
import { useNow } from "@/lib/hooks/use-now";
import { telehealthJoinState } from "@/lib/telehealth-join";
import {
  buildDoctorAgendaTimeline,
  canDoctorMarkVisitComplete,
  filterVisitsForDay,
  formatAgendaDayLabel,
  type DoctorAgendaVisit,
} from "@/lib/doctor-agenda-helpers";
import {
  SchedulingError,
  schedulingService,
} from "@/lib/services/scheduling";
import { useSessionStore } from "@/lib/stores/session";
import { colors } from "@/lib/theme-colors";

export default function DoctorAgendaScreen() {
  const session = useSessionStore((state) => state.session);
  const userId = session?.userId;
  const [selectedDay, setSelectedDay] = useState(() => startOfDay(new Date()));
  const [visits, setVisits] = useState<DoctorAgendaVisit[]>([]);
  const [bufferMinutes, setBufferMinutes] = useState(15);
  const [loading, setLoading] = useState(true);
  const [rangeLoading, setRangeLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rescheduleTarget, setRescheduleTarget] =
    useState<DoctorAgendaVisit | null>(null);
  const [manageBusyId, setManageBusyId] = useState<string | null>(null);
  const [actionBanner, setActionBanner] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<DoctorAgendaVisit | null>(
    null,
  );
  const [confirmSubmitting, setConfirmSubmitting] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  // Re-render every minute so telehealth join windows stay current.
  useNow(60_000);

  // Fetch one week at a time: moving between days in the same week needs no
  // request; crossing into another week loads that week.
  const weekFromYmd = format(
    startOfWeek(selectedDay, { weekStartsOn: 1 }),
    "yyyy-MM-dd",
  );
  const weekToYmd = format(
    endOfWeek(selectedDay, { weekStartsOn: 1 }),
    "yyyy-MM-dd",
  );
  const loadedWeekRef = useRef<string | null>(null);
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    if (!userId) {
      return;
    }

    const requestId = ++requestIdRef.current;
    const isStale = () => requestId !== requestIdRef.current;
    if (loadedWeekRef.current !== weekFromYmd) {
      setRangeLoading(true);
    }

    setError(null);
    try {
      const appointments = await schedulingService.listDoctorAppointments(
        userId,
        { fromYmd: weekFromYmd, toYmd: weekToYmd },
      );
      const [settings, contextById] = await Promise.all([
        schedulingService.getSettings(),
        schedulingService.enrichDoctorAgendaVisits(appointments),
      ]);
      if (isStale()) {
        return;
      }

      setBufferMinutes(settings.bufferMinutes);

      const enriched: DoctorAgendaVisit[] = appointments.flatMap((appointment) => {
        if (!appointment.startsAt || !appointment.endsAt) {
          return [];
        }
        const context = contextById.get(appointment.id);
        if (!context) {
          return [];
        }
        return [
          {
            ...appointment,
            startsAt: appointment.startsAt,
            endsAt: appointment.endsAt,
            beneficiaryName: context.beneficiaryName,
            accountHolderName: context.accountHolderName,
            relationship: context.relationship,
            proxyTag: context.proxyTag,
          },
        ];
      });

      setVisits(enriched);
      loadedWeekRef.current = weekFromYmd;
    } catch (cause) {
      if (isStale()) {
        return;
      }
      setError(
        cause instanceof SchedulingError
          ? cause.message
          : "Could not load your agenda.",
      );
    } finally {
      if (!isStale()) {
        setLoading(false);
        setRangeLoading(false);
        setRefreshing(false);
      }
    }
  }, [userId, weekFromYmd, weekToYmd]);

  // Runs on first focus and every time the tab regains focus.
  useFocusEffect(
    useCallback(() => {
      const task = setTimeout(() => void load(), 0);
      return () => clearTimeout(task);
    }, [load]),
  );

  const dayVisits = useMemo(
    () => filterVisitsForDay(visits, selectedDay),
    [selectedDay, visits],
  );

  const timeline = useMemo(
    () =>
      buildDoctorAgendaTimeline(
        dayVisits.filter((visit) => visit.status !== "cancelled"),
        bufferMinutes,
      ),
    [bufferMinutes, dayVisits],
  );

  const shiftDay = (delta: number) => {
    setSelectedDay((current) =>
      delta < 0 ? subDays(current, 1) : addDays(current, 1),
    );
  };

  const isToday = format(selectedDay, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd");

  const pendingTodayCount = useMemo(() => {
    if (!isToday) {
      return 0;
    }
    return dayVisits.filter(
      (visit) =>
        visit.status === "upcoming" && visit.dbStatus === "pending",
    ).length;
  }, [dayVisits, isToday]);

  const confirmVisit = (visit: DoctorAgendaVisit) => {
    setConfirmError(null);
    setConfirmTarget(visit);
  };

  const submitConfirmVisit = async (values: {
    room: string;
    videoUrl: string;
  }) => {
    if (!confirmTarget) {
      return;
    }
    setConfirmSubmitting(true);
    setConfirmError(null);
    try {
      await schedulingService.confirmDoctorAppointment(confirmTarget.id, {
        room: values.room,
        videoUrl: values.videoUrl,
      });
      setConfirmTarget(null);
      setActionBanner("Appointment confirmed.");
      AccessibilityInfo.announceForAccessibility("Appointment confirmed.");
      await load();
    } catch (cause) {
      setConfirmError(
        cause instanceof SchedulingError
          ? cause.message
          : "Could not confirm the appointment.",
      );
    } finally {
      setConfirmSubmitting(false);
    }
  };

  const markVisitComplete = async (visit: DoctorAgendaVisit) => {
    const confirmed = await confirmAsync({
      title: "Mark visit complete?",
      message: "The patient will see this visit in their Past tab.",
      confirmText: "Mark complete",
      cancelText: "Not yet",
    });
    if (!confirmed) {
      return;
    }
    setManageBusyId(visit.id);
    setActionBanner(null);
    try {
      await schedulingService.completeDoctorAppointment(visit.id);
      setActionBanner("Visit marked complete.");
      AccessibilityInfo.announceForAccessibility("Visit marked complete.");
      await load();
    } catch (cause) {
      const message =
        cause instanceof SchedulingError
          ? cause.message
          : "Could not mark the visit complete.";
      showAlert("Could not complete visit", message);
    } finally {
      setManageBusyId(null);
    }
  };

  const cancelVisit = async (visit: DoctorAgendaVisit) => {
    const confirmed = await confirmAsync({
      title: "Cancel appointment?",
      message: "The patient will be notified and the slot will reopen.",
      confirmText: "Cancel appointment",
      cancelText: "Keep appointment",
      destructive: true,
    });
    if (!confirmed) {
      return;
    }
    setManageBusyId(visit.id);
    setActionBanner(null);
    try {
      await schedulingService.cancelAppointment(visit.id);
      setActionBanner("Appointment cancelled.");
      AccessibilityInfo.announceForAccessibility("Appointment cancelled.");
      await load();
    } catch (cause) {
      const message =
        cause instanceof SchedulingError
          ? cause.message
          : "Could not cancel the appointment.";
      showAlert("Cancel failed", message);
    } finally {
      setManageBusyId(null);
    }
  };

  const joinTelehealth = (visit: DoctorAgendaVisit) => {
    const url = visit.videoUrl;
    if (!url) {
      showAlert("Join unavailable", "This telehealth link is not ready yet.");
      return;
    }
    void Linking.openURL(url);
  };

  const renderVisitCard = (visit: DoctorAgendaVisit) => {
    const join =
      visit.type === "telehealth" && visit.status === "upcoming"
        ? telehealthJoinState(visit.startsAt)
        : { showJoin: false, label: "" };

    const canManage = visit.status === "upcoming";
    const canMarkComplete =
      canManage &&
      visit.dbStatus === "confirmed" &&
      canDoctorMarkVisitComplete(visit.startsAt);

    return (
      <DoctorVisitCard
        beneficiaryName={visit.beneficiaryName}
        dbStatus={visit.dbStatus}
        endsAt={visit.endsAt}
        manageBusy={manageBusyId === visit.id}
        notes={visit.notes}
        proxyTag={visit.proxyTag}
        reason={visit.reason}
        room={visit.room}
        startsAt={visit.startsAt}
        status={visit.status}
        telehealthJoinLabel={join.showJoin ? join.label : undefined}
        type={visit.type}
        onCancel={canManage ? () => void cancelVisit(visit) : undefined}
        onConfirm={
          canManage && visit.dbStatus === "pending"
            ? () => confirmVisit(visit)
            : undefined
        }
        onJoinTelehealth={() => joinTelehealth(visit)}
        onMarkComplete={
          canMarkComplete ? () => void markVisitComplete(visit) : undefined
        }
        onReschedule={
          canManage ? () => setRescheduleTarget(visit) : undefined
        }
      />
    );
  };

  return (
    <View className="flex-1 bg-surface-muted">
      <ShellHeader title="Agenda" />

      <View className="flex-row items-center justify-between px-4 pb-2">
        <Pressable
          accessibilityLabel="Previous day"
          accessibilityRole="button"
          className="h-12 w-12 items-center justify-center rounded-full web:hover:bg-surface"
          onPress={() => shiftDay(-1)}
        >
          <ChevronLeft color={colors.ink} size={24} />
        </Pressable>
        <View className="items-center">
          <Text className="text-base font-semibold text-ink">
            {formatAgendaDayLabel(selectedDay)}
          </Text>
          {isToday ? (
            <Text className="text-sm text-ink-muted">
              Today
              {pendingTodayCount > 0
                ? ` · ${pendingTodayCount} need confirmation`
                : ""}
            </Text>
          ) : (
            <Text className="text-sm text-ink-muted" selectable>
              {format(selectedDay, "yyyy-MM-dd")}
            </Text>
          )}
        </View>
        <Pressable
          accessibilityLabel="Next day"
          accessibilityRole="button"
          className="h-12 w-12 items-center justify-center rounded-full web:hover:bg-surface"
          onPress={() => shiftDay(1)}
        >
          <ChevronRight color={colors.ink} size={24} />
        </Pressable>
      </View>

      <Text className="px-4 pb-3 text-sm text-ink-muted">
        Post-visit buffers ({bufferMinutes} min) match hospital booking rules and
        are not patient appointments.
      </Text>
      {actionBanner ? (
        <Text
          accessibilityLiveRegion="polite"
          className="px-4 pb-2 text-sm text-primary"
        >
          {actionBanner}
        </Text>
      ) : null}

      {loading ? (
        <ScreenLoadingSkeleton>
          <VisitListSkeleton count={3} />
        </ScreenLoadingSkeleton>
      ) : error ? (
        <View className="flex-1 justify-center px-4">
          <SchedulingStatePanel message={error} onRetry={() => void load()} />
        </View>
      ) : (
        <ScrollView
          contentContainerClassName="gap-3 px-4 pb-8"
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
          {rangeLoading ? (
            <VisitListSkeleton count={3} />
          ) : timeline.length === 0 ? (
            <View className="gap-3">
              <EmptyState message="No visits scheduled for this day." />
              <Pressable
                accessibilityLabel="Open schedule to add availability"
                accessibilityRole="button"
                className="min-h-12 items-center justify-center rounded-xl border border-primary px-4 web:hover:opacity-90"
                onPress={() => router.push("/schedule")}
              >
                <Text className="font-semibold text-primary">
                  Add slots in Schedule
                </Text>
              </Pressable>
            </View>
          ) : (
            timeline.map((item, index) => {
              if (item.kind === "buffer") {
                return (
                  <PostVisitBufferCard
                    key={`buffer-${item.startsAt}-${item.endsAt}-${index}`}
                    endsAt={item.endsAt}
                    minutes={item.minutes}
                    startsAt={item.startsAt}
                  />
                );
              }

              return (
                <View key={item.visit.id}>{renderVisitCard(item.visit)}</View>
              );
            })
          )}

          {dayVisits.some((visit) => visit.status === "cancelled") ? (
            <View className="gap-3 pt-2">
              <Text className="text-sm font-semibold text-ink-muted">Cancelled</Text>
              {dayVisits
                .filter((visit) => visit.status === "cancelled")
                .map((visit) => (
                  <View key={`cancelled-${visit.id}`}>
                    {renderVisitCard(visit)}
                  </View>
                ))}
            </View>
          ) : null}
        </ScrollView>
      )}

      {rescheduleTarget && session ? (
        <RescheduleSheet
          appointmentId={rescheduleTarget.id}
          currentSlotId={rescheduleTarget.slotId}
          doctorId={session.userId}
          doctorName={session.displayName}
          open={Boolean(rescheduleTarget)}
          onOpenChange={(open) => {
            if (!open) {
              setRescheduleTarget(null);
            }
          }}
          onRescheduled={() => {
            setActionBanner("Appointment rescheduled.");
            AccessibilityInfo.announceForAccessibility("Appointment rescheduled.");
            void load();
          }}
        />
      ) : null}

      {confirmTarget ? (
        <ConfirmVisitSheet
          key={confirmTarget.id}
          appointmentType={confirmTarget.type}
          beneficiaryName={confirmTarget.beneficiaryName}
          errorMessage={confirmError}
          homeVisitAddress={confirmTarget.address}
          open={Boolean(confirmTarget)}
          submitting={confirmSubmitting}
          onConfirm={submitConfirmVisit}
          onOpenChange={(open) => {
            if (!open) {
              setConfirmTarget(null);
              setConfirmError(null);
            }
          }}
        />
      ) : null}
    </View>
  );
}
