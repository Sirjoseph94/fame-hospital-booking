import { useEffect, useMemo, useState } from "react";
import {
  AccessibilityInfo,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import * as Linking from "expo-linking";
import { isPast, parseISO } from "date-fns";

import { RefreshErrorNotice } from "@/components/ui/refresh-error-notice";
import { RescheduleSheet } from "@/components/patient/reschedule-sheet";
import { VisitCard } from "@/components/ui/visit-card";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SchedulingStatePanel } from "@/components/ui/scheduling-state-panel";
import {
  ScreenLoadingSkeleton,
  VisitListSkeleton,
} from "@/components/ui/skeleton";
import { ShellHeader } from "@/components/shell-header";
import { confirmAsync, showAlert } from "@/lib/confirm";
import { useNow } from "@/lib/hooks/use-now";
import {
  useCancelAppointment,
  usePatientAppointments,
} from "@/lib/queries/appointments";
import { useBeneficiaries } from "@/lib/queries/beneficiaries";
import { useDoctors } from "@/lib/queries/doctors";
import { queryKeys } from "@/lib/query/keys";
import { useRefreshOnFocus } from "@/lib/query/use-refresh-on-focus";
import { telehealthJoinState } from "@/lib/telehealth-join";
import { useSessionStore } from "@/lib/stores/session";
import { useVisitStatusSnapshot } from "@/lib/stores/visit-status-snapshot";
import { SchedulingError } from "@/lib/services/scheduling";
import type { Appointment, Beneficiary } from "@/types/scheduling";

type VisitsTab = "upcoming" | "past" | "proxy";

const tabs: { id: VisitsTab; label: string }[] = [
  { id: "upcoming", label: "Upcoming" },
  { id: "past", label: "Past" },
  { id: "proxy", label: "Proxy Managed" },
];

interface EnrichedVisit extends Appointment {
  beneficiaryName: string;
  beneficiaryRelationship: Beneficiary["relationship"];
  doctorName: string;
  proxyTag?: string;
}

function visitsErrorMessage(cause: unknown): string {
  return cause instanceof SchedulingError
    ? cause.message
    : "Could not load your visits.";
}

export default function PatientVisitsScreen() {
  const userId = useSessionStore((state) => state.session?.userId);
  const mergeStatuses = useVisitStatusSnapshot((state) => state.mergeStatuses);
  const [activeTab, setActiveTab] = useState<VisitsTab>("upcoming");
  const appointmentsQuery = usePatientAppointments(userId);
  const beneficiariesQuery = useBeneficiaries(userId);
  const doctorsQuery = useDoctors();
  const cancelAppointment = useCancelAppointment();
  const [userRefreshing, setUserRefreshing] = useState(false);
  const [rescheduleTarget, setRescheduleTarget] = useState<EnrichedVisit | null>(
    null,
  );
  const [cancelBanner, setCancelBanner] = useState<string | null>(null);
  // Re-render every minute so telehealth join windows stay current.
  useNow(60_000);

  // Refresh when the tab regains focus (e.g. after booking).
  useRefreshOnFocus([
    queryKeys.appointments.patient(userId ?? ""),
    queryKeys.beneficiaries(userId ?? ""),
    queryKeys.doctors.list,
  ]);

  const appointmentRows = appointmentsQuery.data;
  const beneficiaryRows = beneficiariesQuery.data;
  const doctorRows = doctorsQuery.data;

  // Announce status changes (e.g. a doctor confirmed a visit) whenever fresh
  // appointment data arrives.
  useEffect(() => {
    if (!appointmentRows) {
      return;
    }
    const snapshot: Record<string, Appointment["dbStatus"]> = {};
    appointmentRows.forEach((row) => {
      snapshot[row.id] = row.dbStatus;
    });
    const announcements = mergeStatuses(snapshot);
    for (const line of announcements) {
      AccessibilityInfo.announceForAccessibility(line);
    }
  }, [appointmentRows, mergeStatuses]);

  const visitQueries = [appointmentsQuery, beneficiariesQuery, doctorsQuery];
  const initialLoading = visitQueries.some(
    (query) => query.data === undefined && query.isPending,
  );
  const blockingError = visitQueries.find(
    (query) => query.isError && query.data === undefined,
  )?.error;
  const refreshError = visitQueries.find((query) => query.isError)?.error;
  const refetchAll = () =>
    Promise.all(visitQueries.map((query) => query.refetch()));

  const onPullToRefresh = async () => {
    setUserRefreshing(true);
    try {
      await refetchAll();
    } finally {
      setUserRefreshing(false);
    }
  };

  const enriched = useMemo((): EnrichedVisit[] => {
    const beneficiaries = beneficiaryRows ?? [];
    const doctorNames: Record<string, string> = {};
    (doctorRows ?? []).forEach((doctor) => {
      doctorNames[doctor.id] = doctor.name;
    });
    return (appointmentRows ?? []).flatMap((appointment) => {
      if (!appointment.startsAt) {
        return [];
      }

      const beneficiary = beneficiaries.find(
        (row) => row.id === appointment.beneficiaryId,
      );
      const doctorName = doctorNames[appointment.doctorId] ?? "Doctor";

      const proxyTag =
        beneficiary && beneficiary.relationship !== "self"
          ? `Booked for ${beneficiary.displayName} [${beneficiary.relationship}]`
          : undefined;

      const row: EnrichedVisit = {
        ...appointment,
        startsAt: appointment.startsAt,
        beneficiaryName: beneficiary?.displayName ?? "Patient",
        beneficiaryRelationship: beneficiary?.relationship ?? "self",
        doctorName,
        proxyTag,
      };
      return [row];
    });
  }, [appointmentRows, beneficiaryRows, doctorRows]);

  const filtered = useMemo(() => {
    if (activeTab === "upcoming") {
      return enriched.filter(
        (visit) =>
          visit.status === "upcoming" &&
          !isPast(parseISO(visit.startsAt!)),
      );
    }
    if (activeTab === "past") {
      return enriched.filter(
        (visit) =>
          visit.status === "completed" ||
          visit.status === "cancelled" ||
          (visit.status === "upcoming" && isPast(parseISO(visit.startsAt!))),
      );
    }
    return enriched.filter(
      (visit) => visit.beneficiaryRelationship !== "self",
    );
  }, [activeTab, enriched]);

  const cancelVisit = async (visit: EnrichedVisit) => {
    const confirmed = await confirmAsync({
      title: "Cancel appointment?",
      message: "This will release the time slot for other patients.",
      confirmText: "Cancel appointment",
      cancelText: "Keep appointment",
      destructive: true,
    });
    if (!confirmed) {
      return;
    }
    try {
      await cancelAppointment.mutateAsync(visit.id);
      setCancelBanner("Appointment cancelled.");
      AccessibilityInfo.announceForAccessibility("Appointment cancelled.");
    } catch (cause) {
      const message =
        cause instanceof SchedulingError
          ? cause.message
          : "Could not cancel the appointment.";
      showAlert("Cancel failed", message);
    }
  };

  const joinTelehealth = (visit: EnrichedVisit) => {
    const url = visit.videoUrl;
    if (!url) {
      showAlert(
        "Join unavailable",
        "This telehealth link is not ready yet. Contact the hospital if you need help.",
      );
      return;
    }
    void Linking.openURL(url);
  };

  return (
    <View className="flex-1 bg-surface-muted">
      <ShellHeader title="My Visits" />

      <View
        accessibilityRole="tablist"
        className="flex-row gap-2 px-4 pb-2"
      >
        {tabs.map((tab) => {
          const selected = activeTab === tab.id;
          return (
            <Pressable
              key={tab.id}
              accessibilityLabel={tab.label}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              className={[
                "min-h-12 flex-1 items-center justify-center rounded-xl border px-2 web:hover:opacity-90",
                selected
                  ? "border-primary bg-primary"
                  : "border-ink-muted bg-surface",
              ].join(" ")}
              onPress={() => setActiveTab(tab.id)}
            >
              <Text
                className={[
                  "text-center text-sm font-semibold",
                  selected ? "text-surface" : "text-ink",
                ].join(" ")}
              >
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {initialLoading ? (
        <ScreenLoadingSkeleton>
          <VisitListSkeleton count={2} />
        </ScreenLoadingSkeleton>
      ) : blockingError ? (
        <View className="flex-1 justify-center px-4">
          <SchedulingStatePanel
            message={visitsErrorMessage(blockingError)}
            onRetry={() => void refetchAll()}
          />
        </View>
      ) : (
        <ScrollView
          contentContainerClassName="gap-3 px-4 pb-8 pt-2"
          contentInsetAdjustmentBehavior="automatic"
          refreshControl={
            <RefreshControl
              refreshing={userRefreshing}
              onRefresh={() => void onPullToRefresh()}
            />
          }
        >
          <RefreshErrorNotice
            message={refreshError ? visitsErrorMessage(refreshError) : null}
          />

          {cancelBanner ? (
            <Card>
              <Text accessibilityLiveRegion="polite" className="text-base text-ink">
                {cancelBanner}
              </Text>
              <Text className="text-sm text-ink-muted">
                The time slot is available for other patients.
              </Text>
            </Card>
          ) : null}

          {filtered.length === 0 ? (
            <EmptyState
              message={
                activeTab === "upcoming"
                  ? "No upcoming visits."
                  : activeTab === "past"
                    ? "No past visits yet."
                    : "No proxy-managed visits."
              }
            />
          ) : (
            filtered.map((visit) => {
              const join = visit.startsAt
                ? telehealthJoinState(visit.startsAt)
                : { showJoin: false, label: "" };

              return (
                <View className="gap-2" key={visit.id}>
                  <VisitCard
                    address={visit.address}
                    beneficiaryName={visit.beneficiaryName}
                    dbStatus={visit.dbStatus}
                    doctorName={visit.doctorName}
                    proxyTag={visit.proxyTag}
                    room={visit.room}
                    startsAt={visit.startsAt!}
                    status={visit.status}
                    telehealthJoinLabel={
                      visit.type === "telehealth" &&
                      visit.dbStatus === "confirmed" &&
                      visit.videoUrl &&
                      join.showJoin
                        ? join.label
                        : undefined
                    }
                    type={visit.type}
                    onJoinTelehealth={() => joinTelehealth(visit)}
                  />
                  {visit.status === "upcoming" && activeTab === "upcoming" ? (
                    <View className="flex-row gap-2">
                      <Pressable
                        accessibilityLabel={`Reschedule visit with ${visit.doctorName}`}
                        accessibilityRole="button"
                        className="min-h-12 flex-1 items-center justify-center rounded-xl border border-primary px-3 web:hover:opacity-90"
                        onPress={() => setRescheduleTarget(visit)}
                      >
                        <Text className="font-semibold text-primary">
                          Reschedule
                        </Text>
                      </Pressable>
                      <Pressable
                        accessibilityLabel={`Cancel visit with ${visit.doctorName}`}
                        accessibilityRole="button"
                        className="min-h-12 flex-1 items-center justify-center rounded-xl border border-ink-muted bg-surface px-3 web:hover:opacity-90"
                        disabled={cancelAppointment.isPending}
                        onPress={() => void cancelVisit(visit)}
                      >
                        <Text className="font-semibold text-ink">Cancel</Text>
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      {rescheduleTarget ? (
        <RescheduleSheet
          appointmentId={rescheduleTarget.id}
          currentSlotId={rescheduleTarget.slotId}
          doctorId={rescheduleTarget.doctorId}
          doctorName={rescheduleTarget.doctorName}
          open={Boolean(rescheduleTarget)}
          onOpenChange={(open) => {
            if (!open) {
              setRescheduleTarget(null);
            }
          }}
          onRescheduled={() => {
            setCancelBanner(null);
            AccessibilityInfo.announceForAccessibility("Visit rescheduled.");
          }}
        />
      ) : null}
    </View>
  );
}
