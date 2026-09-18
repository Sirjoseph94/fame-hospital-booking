import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AccessibilityInfo,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import * as Linking from "expo-linking";
import { isPast, parseISO } from "date-fns";

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
import { telehealthJoinState } from "@/lib/telehealth-join";
import { useSessionStore } from "@/lib/stores/session";
import { useVisitStatusSnapshot } from "@/lib/stores/visit-status-snapshot";
import {
  SchedulingError,
  schedulingService,
} from "@/lib/services/scheduling";
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

export default function PatientVisitsScreen() {
  const session = useSessionStore((state) => state.session);
  const mergeStatuses = useVisitStatusSnapshot((state) => state.mergeStatuses);
  const [activeTab, setActiveTab] = useState<VisitsTab>("upcoming");
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [beneficiaries, setBeneficiaries] = useState<Beneficiary[]>([]);
  const [doctorsLoaded, setDoctorsLoaded] = useState<
    Record<string, string>
  >({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rescheduleTarget, setRescheduleTarget] = useState<EnrichedVisit | null>(
    null,
  );
  const [cancelBanner, setCancelBanner] = useState<string | null>(null);
  const [, setJoinTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setJoinTick((value) => value + 1), 60_000);
    return () => clearInterval(timer);
  }, []);

  const load = useCallback(async () => {
    if (!session) {
      return;
    }
    setError(null);
    try {
      const [appointmentRows, beneficiaryRows, doctorRows] = await Promise.all([
        schedulingService.listAppointments(session.userId),
        schedulingService.listBeneficiaries(session.userId),
        schedulingService.listDoctors(),
      ]);
      const snapshot: Record<string, Appointment["dbStatus"]> = {};
      appointmentRows.forEach((row) => {
        snapshot[row.id] = row.dbStatus;
      });
      const announcements = mergeStatuses(snapshot);
      for (const line of announcements) {
        AccessibilityInfo.announceForAccessibility(line);
      }

      setAppointments(appointmentRows);
      setBeneficiaries(beneficiaryRows);
      const names: Record<string, string> = {};
      doctorRows.forEach((doctor) => {
        names[doctor.id] = doctor.name;
      });
      setDoctorsLoaded(names);
    } catch (cause) {
      setError(
        cause instanceof SchedulingError
          ? cause.message
          : "Could not load your visits.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [mergeStatuses, session]);

  useEffect(() => {
    const task = setTimeout(() => void load(), 0);
    return () => clearTimeout(task);
  }, [load]);

  const enriched = useMemo((): EnrichedVisit[] => {
    return appointments.flatMap((appointment) => {
      if (!appointment.startsAt) {
        return [];
      }

      const beneficiary = beneficiaries.find(
        (row) => row.id === appointment.beneficiaryId,
      );
      const doctorName = doctorsLoaded[appointment.doctorId] ?? "Doctor";

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
  }, [appointments, beneficiaries, doctorsLoaded]);

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

  const cancelVisit = (visit: EnrichedVisit) => {
    Alert.alert(
      "Cancel appointment?",
      "This will release the time slot for other patients.",
      [
        { text: "Keep appointment", style: "cancel" },
        {
          text: "Cancel appointment",
          style: "destructive",
          onPress: () => {
            void (async () => {
              try {
                await schedulingService.cancelAppointment(visit.id);
                setCancelBanner("Appointment cancelled.");
                AccessibilityInfo.announceForAccessibility(
                  "Appointment cancelled.",
                );
                await load();
              } catch (cause) {
                const message =
                  cause instanceof SchedulingError
                    ? cause.message
                    : "Could not cancel the appointment.";
                Alert.alert("Cancel failed", message);
              }
            })();
          },
        },
      ],
    );
  };

  const joinTelehealth = (visit: EnrichedVisit) => {
    const url = visit.videoUrl;
    if (!url) {
      Alert.alert(
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

      {loading ? (
        <ScreenLoadingSkeleton>
          <VisitListSkeleton count={2} />
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
                        onPress={() => cancelVisit(visit)}
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
            void load();
          }}
        />
      ) : null}
    </View>
  );
}
