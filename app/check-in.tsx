import { useEffect, useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import { isSameDay, isPast, parseISO } from "date-fns";
import { Redirect, router, useLocalSearchParams } from "expo-router";

import { PageScrollView } from "@/components/ui/page-scroll-view";
import { goBack } from "@/components/legal/legal-page";
import { BackButton } from "@/components/ui/back-button";
import { Card } from "@/components/ui/card";
import { CardSkeleton } from "@/components/ui/skeleton";
import { usePatientAppointments } from "@/lib/queries/appointments";
import { useBeneficiaries } from "@/lib/queries/beneficiaries";
import { useDoctors } from "@/lib/queries/doctors";
import { checkInCodeFromScan } from "@/lib/services/scheduling";
import { formatSessionTimes } from "@/lib/session-groups";
import { usePendingCheckIn } from "@/lib/stores/pending-check-in";
import { useSessionStore } from "@/lib/stores/session";

/** Signed out: remember the scanned code, then sign in. */
function SignInFirst({ code }: { code: string | null }) {
  const setPending = usePendingCheckIn((state) => state.setCode);
  useEffect(() => {
    setPending(code);
    router.replace("/sign-in");
  }, [code, setPending]);
  return null;
}

/**
 * Opened by scanning the reception poster with the phone's camera
 * (fame-hospital://check-in?code=ABC123). Picks today's visit and opens its
 * check-in; with several visits today, asks which one.
 */
export default function CheckInLinkScreen() {
  const params = useLocalSearchParams<{ code?: string }>();
  const code = typeof params.code === "string" ? checkInCodeFromScan(params.code) : null;
  const authReady = useSessionStore((state) => state.authReady);
  const hasHydrated = useSessionStore((state) => state.hasHydrated);
  const session = useSessionStore((state) => state.session);
  const userId = session?.role === "patient" ? session.userId : undefined;
  const appointmentsQuery = usePatientAppointments(userId);
  const beneficiariesQuery = useBeneficiaries(userId);
  const doctorsQuery = useDoctors();

  const todays = useMemo(
    () =>
      (appointmentsQuery.data ?? []).filter(
        (visit) =>
          visit.status === "upcoming" &&
          visit.sessionId &&
          !visit.sessionCancelled &&
          visit.startsAt &&
          visit.endsAt &&
          isSameDay(parseISO(visit.startsAt), new Date()) &&
          !isPast(parseISO(visit.endsAt)),
      ),
    [appointmentsQuery.data],
  );

  if (!authReady || !hasHydrated) {
    return (
      <View className="flex-1 bg-surface-muted px-4 pt-6">
        <CardSkeleton lines={3} />
      </View>
    );
  }
  if (!session) {
    return <SignInFirst code={code} />;
  }

  const open = (appointmentId: string) =>
    router.replace({ pathname: "/visit/[id]", params: { id: appointmentId, ...(code ? { code } : {}) } });

  if (session.role === "patient" && todays.length === 1 && todays[0]!.checkedInAt === undefined) {
    return <Redirect href={{ pathname: "/visit/[id]", params: { id: todays[0]!.id, ...(code ? { code } : {}) } }} />;
  }

  const nameOf = (beneficiaryId: string) =>
    beneficiariesQuery.data?.find((row) => row.id === beneficiaryId)?.displayName ?? "Patient";
  const doctorOf = (doctorId: string) => doctorsQuery.data?.find((row) => row.id === doctorId)?.name ?? "Doctor";

  return (
    <PageScrollView className="flex-1 bg-surface-muted" contentContainerClassName="items-center px-4 pb-10 pt-4">
      <View className="w-full max-w-xl gap-4">
        <BackButton label="Back" onPress={goBack} />
        <Text accessibilityRole="header" className="text-2xl font-bold text-ink">
          Check in
        </Text>
        {session.role !== "patient" ? (
          <Card>
            <Text className="text-base text-ink">
              Check-in is for patients. Staff can mark arrivals from the clinic queue.
            </Text>
          </Card>
        ) : appointmentsQuery.isPending ? (
          <CardSkeleton lines={3} />
        ) : todays.length === 0 ? (
          <Card style={{ gap: 10 }}>
            <Text className="text-base text-ink">You have no visit to check in for today.</Text>
            <Pressable
              accessibilityRole="button"
              className="min-h-12 items-center justify-center rounded-xl bg-primary px-4 active:opacity-80"
              onPress={() => router.replace("/visits")}
            >
              <Text className="text-base font-semibold text-surface">Go to My Visits</Text>
            </Pressable>
          </Card>
        ) : (
          <View className="gap-3">
            <Text className="text-base text-ink-muted">Which visit are you checking in for?</Text>
            {todays.map((visit) => (
              <Pressable
                key={visit.id}
                accessibilityRole="button"
                className="active:opacity-80"
                onPress={() => open(visit.id)}
              >
                <Card style={{ gap: 4 }}>
                  <Text className="text-base font-semibold text-ink">{nameOf(visit.beneficiaryId)}</Text>
                  <Text className="text-sm text-ink-muted">
                    {doctorOf(visit.doctorId)} · {formatSessionTimes({ startsAt: visit.startsAt!, endsAt: visit.endsAt! })}
                    {visit.checkedInAt ? " · checked in" : ""}
                  </Text>
                </Card>
              </Pressable>
            ))}
          </View>
        )}
      </View>
    </PageScrollView>
  );
}
