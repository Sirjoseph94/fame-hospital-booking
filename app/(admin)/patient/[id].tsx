import { useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { format, parseISO } from "date-fns";
import { ChevronLeft } from "lucide-react-native";

import { Card } from "@/components/ui/card";
import { SchedulingStatePanel } from "@/components/ui/scheduling-state-panel";
import { CardSkeleton, ScreenLoadingSkeleton } from "@/components/ui/skeleton";
import { confirmAsync, showAlert } from "@/lib/confirm";
import { useDoctorRoster } from "@/lib/queries/doctors";
import { usePatientRecord, useSetPatientActive } from "@/lib/queries/patients";
import { formatSessionWhen } from "@/lib/session-groups";
import { colors } from "@/lib/theme-colors";
import { visitStatusLabel } from "@/lib/visit-status-label";

function goBack() {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace("/patients");
  }
}

function Detail({ label, value }: { label: string; value?: string }) {
  if (!value) {
    return null;
  }
  return (
    <Text className="text-sm text-ink" selectable>
      <Text className="text-ink-muted">{label}: </Text>
      {value}
    </Text>
  );
}

/** Admin: one patient's account, family members and visits. */
export default function AdminPatientScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const recordQuery = usePatientRecord(id);
  const rosterQuery = useDoctorRoster();
  const setActive = useSetPatientActive();
  const [userRefreshing, setUserRefreshing] = useState(false);

  const patient = recordQuery.data;
  const doctorName = (doctorId: string) =>
    rosterQuery.data?.find((doctor) => doctor.id === doctorId)?.name ?? "Doctor";
  const beneficiaryName = (beneficiaryId: string) =>
    patient?.beneficiaries.find((row) => row.id === beneficiaryId)?.displayName ?? patient?.fullName;

  const refresh = async () => {
    setUserRefreshing(true);
    try {
      await recordQuery.refetch();
    } finally {
      setUserRefreshing(false);
    }
  };

  const toggleActive = async () => {
    if (!patient) {
      return;
    }
    const deactivate = patient.isActive;
    const confirmed = await confirmAsync({
      title: deactivate ? `Deactivate ${patient.fullName}?` : `Reactivate ${patient.fullName}?`,
      message: deactivate
        ? "They won't be able to use the app or book until reactivated. Existing bookings are kept."
        : "They'll be able to sign in and book again.",
      confirmText: deactivate ? "Deactivate" : "Reactivate",
      cancelText: "Cancel",
      destructive: deactivate,
    });
    if (!confirmed) {
      return;
    }
    try {
      await setActive.mutateAsync({ patientId: patient.id, isActive: !deactivate });
    } catch (cause) {
      showAlert("Could not update account", cause instanceof Error ? cause.message : "Try again.");
    }
  };

  return (
    <View className="flex-1 bg-surface-muted">
      <View className="flex-row items-center gap-2 px-2 py-3">
        <Pressable
          accessibilityLabel="Back to patients"
          accessibilityRole="button"
          className="h-12 w-12 items-center justify-center rounded-full web:hover:bg-surface"
          onPress={goBack}
        >
          <ChevronLeft color={colors.ink} size={24} />
        </Pressable>
        <View className="min-w-0 flex-1">
          <Text className="text-lg font-bold text-ink" numberOfLines={1}>
            {patient?.fullName ?? "Patient"}
          </Text>
          <Text className="text-sm text-ink-muted">Patient record</Text>
        </View>
      </View>

      {recordQuery.isError && !patient ? (
        <View className="flex-1 justify-center px-4">
          <SchedulingStatePanel
            message={recordQuery.error instanceof Error ? recordQuery.error.message : "Could not load the patient."}
            onRetry={() => void recordQuery.refetch()}
          />
        </View>
      ) : !patient ? (
        <ScreenLoadingSkeleton>
          <View className="gap-4 px-4">
            <CardSkeleton lines={3} />
            <CardSkeleton lines={4} />
          </View>
        </ScreenLoadingSkeleton>
      ) : (
        <ScrollView
          contentContainerClassName="gap-4 px-4 pb-8"
          contentInsetAdjustmentBehavior="automatic"
          refreshControl={<RefreshControl refreshing={userRefreshing} onRefresh={() => void refresh()} />}
        >
          <Card style={{ gap: 8 }}>
            <Text className="text-base font-semibold text-ink">Account</Text>
            <Detail label="Status" value={patient.isActive ? "Active" : "Deactivated"} />
            <Detail label="Phone" value={patient.phone} />
            <Detail label="Address" value={patient.address} />
            <Detail label="Emergency contact" value={patient.emergencyContact} />
            <Detail label="Joined" value={format(parseISO(patient.createdAt), "MMM d, yyyy")} />
            <Pressable
              accessibilityLabel={patient.isActive ? "Deactivate account" : "Reactivate account"}
              accessibilityRole="button"
              accessibilityState={{ busy: setActive.isPending, disabled: setActive.isPending }}
              className="mt-2 min-h-12 items-center justify-center rounded-xl border border-ink-muted px-4 web:hover:opacity-90"
              disabled={setActive.isPending}
              onPress={() => void toggleActive()}
            >
              {setActive.isPending ? (
                <ActivityIndicator color={colors.ink} />
              ) : (
                <Text className="text-base font-semibold text-ink">
                  {patient.isActive ? "Deactivate account" : "Reactivate account"}
                </Text>
              )}
            </Pressable>
          </Card>

          <Card style={{ gap: 8 }}>
            <Text className="text-base font-semibold text-ink">People they book for</Text>
            {patient.beneficiaries.length === 0 ? (
              <Text className="text-sm text-ink-muted">None yet.</Text>
            ) : (
              patient.beneficiaries.map((person) => (
                <Text key={person.id} className="text-sm text-ink" selectable>
                  {person.displayName}
                  <Text className="capitalize text-ink-muted">
                    {" "}
                    · {person.relationship === "self" ? "self" : person.relationship} · born{" "}
                    {format(parseISO(person.dob), "d MMM yyyy")}
                    {person.hospitalFileId ? ` · file ${person.hospitalFileId}` : ""}
                    {person.archived ? " · removed" : ""}
                  </Text>
                </Text>
              ))
            )}
          </Card>

          <View className="gap-2">
            <Text className="text-base font-semibold text-ink">
              Visits ({patient.appointments.length})
            </Text>
            {patient.appointments.length === 0 ? (
              <Text className="text-sm text-ink-muted">No visits yet.</Text>
            ) : (
              patient.appointments.map((visit) => (
                <Card key={visit.id} style={{ gap: 4 }}>
                  <View className="flex-row items-start justify-between gap-3">
                    <Text className="min-w-0 flex-1 text-sm font-semibold text-ink" selectable>
                      {beneficiaryName(visit.beneficiaryId)} · {doctorName(visit.doctorId)}
                    </Text>
                    <Text className="text-xs font-semibold uppercase text-ink-muted">
                      {visitStatusLabel(visit.status, visit.dbStatus, "admin", visit.startsAt)}
                    </Text>
                  </View>
                  {visit.startsAt && visit.endsAt ? (
                    <Text className="text-sm text-ink-muted">
                      {formatSessionWhen({ startsAt: visit.startsAt, endsAt: visit.endsAt })}
                    </Text>
                  ) : null}
                  {visit.reason ? (
                    <Text className="text-sm text-ink-muted" numberOfLines={2}>
                      Reason: {visit.reason}
                    </Text>
                  ) : null}
                </Card>
              ))
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
}
