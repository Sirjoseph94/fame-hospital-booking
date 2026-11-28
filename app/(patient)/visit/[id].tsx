import { useMemo, useState } from "react";
import { AccessibilityInfo, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { differenceInMinutes, isPast, parseISO } from "date-fns";
import { router, useLocalSearchParams } from "expo-router";
import { CalendarPlus, Info } from "lucide-react-native";

import { CheckInSheet } from "@/components/patient/check-in-sheet";
import { MoveSessionSheet } from "@/components/patient/move-session-sheet";
import { QueueStatusCard } from "@/components/patient/queue-status-card";
import { BackButton } from "@/components/ui/back-button";
import { Card } from "@/components/ui/card";
import { SchedulingStatePanel } from "@/components/ui/scheduling-state-panel";
import { CardSkeleton, ScreenLoadingSkeleton } from "@/components/ui/skeleton";
import { VisitCard } from "@/components/ui/visit-card";
import { confirmAsync, showAlert } from "@/lib/confirm";
import { useNow } from "@/lib/hooks/use-now";
import { useCancelAppointment, usePatientAppointments } from "@/lib/queries/appointments";
import { useBeneficiaries } from "@/lib/queries/beneficiaries";
import { useDoctors } from "@/lib/queries/doctors";
import { useHospitalInfo } from "@/lib/queries/hospital-info";
import { exportAppointmentToCalendar } from "@/lib/services/calendarExport";
import { SchedulingError } from "@/lib/services/scheduling";
import { useBookingStore } from "@/lib/stores/booking";
import { useSessionStore } from "@/lib/stores/session";
import { colors } from "@/lib/theme-colors";

const ARRIVAL_NOTE =
  "Patients are seen in order of arrival during the session. Check in with the app when you arrive.";

function goBack() {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace("/visits");
  }
}

function Detail({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <View className="gap-0.5">
      <Text className="text-xs font-semibold uppercase text-ink-muted">{label}</Text>
      <Text className="text-base text-ink" selectable>
        {value}
      </Text>
    </View>
  );
}

/** Patient: one visit — status, check-in and queue, and what they can do with it. */
export default function PatientVisitScreen() {
  const { id, code } = useLocalSearchParams<{ id: string; code?: string }>();
  const userId = useSessionStore((state) => state.session?.userId);
  const appointmentsQuery = usePatientAppointments(userId);
  const beneficiariesQuery = useBeneficiaries(userId);
  const doctorsQuery = useDoctors();
  const { data: hospitalInfo } = useHospitalInfo();
  const cancelAppointment = useCancelAppointment();
  const beginReturningFlow = useBookingStore((state) => state.beginReturningFlow);
  const beginStandardFlow = useBookingStore((state) => state.beginStandardFlow);
  useNow(30_000);

  // A scanned poster link opens the check-in straight away.
  const [checkInOpen, setCheckInOpen] = useState(Boolean(code));
  const [moveOpen, setMoveOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const visit = useMemo(
    () => appointmentsQuery.data?.find((row) => row.id === id),
    [appointmentsQuery.data, id],
  );
  const beneficiary = beneficiariesQuery.data?.find((row) => row.id === visit?.beneficiaryId);
  const doctor = doctorsQuery.data?.find((row) => row.id === visit?.doctorId);
  const doctorName = doctor?.name ?? "your doctor";
  const patientName = beneficiary?.displayName ?? "Patient";

  const refresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([appointmentsQuery.refetch(), beneficiariesQuery.refetch()]);
    } finally {
      setRefreshing(false);
    }
  };

  if (!visit || !visit.startsAt || !visit.endsAt) {
    return (
      <View className="flex-1 bg-surface-muted">
        <View className="px-2 py-3">
          <BackButton label="My Visits" onPress={goBack} />
        </View>
        {appointmentsQuery.isPending ? (
          <ScreenLoadingSkeleton>
            <View className="gap-4 px-4">
              <CardSkeleton lines={4} />
            </View>
          </ScreenLoadingSkeleton>
        ) : (
          <View className="flex-1 justify-center px-4">
            <SchedulingStatePanel
              message={
                appointmentsQuery.isError
                  ? "Could not load this visit."
                  : "This visit isn't in your account any more."
              }
              onRetry={() => void appointmentsQuery.refetch()}
            />
          </View>
        )}
      </View>
    );
  }

  const startsAt = visit.startsAt;
  const endsAt = visit.endsAt;
  const upcoming = visit.status === "upcoming" && !isPast(parseISO(endsAt));
  const canMove = upcoming && Boolean(visit.sessionId) && !visit.checkedInAt;
  const sourceNote =
    visit.source === "follow_up"
      ? `Follow-up booked by ${doctor?.name ?? "your doctor"}.`
      : visit.source === "waitlist"
        ? "You got this place from the waitlist."
        : undefined;

  const addToCalendar = async () => {
    const result = await exportAppointmentToCalendar({
      appointmentId: visit.id,
      title: `Clinic with ${doctorName}`,
      startsAt,
      durationMin: Math.max(differenceInMinutes(parseISO(endsAt), parseISO(startsAt)), 15),
      type: visit.type,
      room: visit.room,
      note: ARRIVAL_NOTE,
      hospitalName: hospitalInfo?.name,
      hospitalAddress: hospitalInfo?.address,
    });
    const text = result.ok ? "Added to your calendar." : result.message;
    setMessage(text);
    AccessibilityInfo.announceForAccessibility(text);
  };

  const cancelVisit = async () => {
    const confirmed = await confirmAsync({
      title: "Cancel this visit?",
      message: "Your place in the session will be given to another patient.",
      confirmText: "Cancel visit",
      cancelText: "Keep visit",
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await cancelAppointment.mutateAsync(visit.id);
      setMessage("Visit cancelled. Your place has been released.");
      AccessibilityInfo.announceForAccessibility("Visit cancelled.");
    } catch (cause) {
      showAlert("Cancel failed", cause instanceof SchedulingError ? cause.message : "Could not cancel the visit.");
    }
  };

  const bookAgain = () => {
    if (!doctor?.isAcceptingBookings || !beneficiary || beneficiary.archived) {
      if (beneficiary && !beneficiary.archived) {
        beginStandardFlow(beneficiary.id);
      }
      router.push("/book/doctor");
      return;
    }
    beginReturningFlow({ beneficiaryId: beneficiary.id, doctorId: doctor.id, doctorName: doctor.name });
    router.push("/book/session");
  };

  return (
    <View className="flex-1 bg-surface-muted">
      <View className="px-2 py-3">
        <BackButton label="My Visits" onPress={goBack} />
      </View>
      <ScrollView
        contentContainerClassName="gap-4 px-4 pb-8"
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
      >
        <VisitCard
          beneficiaryName={patientName}
          dbStatus={visit.dbStatus}
          doctorName={doctorName}
          endsAt={endsAt}
          progress={visit}
          room={visit.room}
          sessionCancelled={visit.sessionCancelled}
          startsAt={startsAt}
          status={visit.status}
        />

        {upcoming ? (
          <QueueStatusCard
            room={visit.room}
            visit={{ ...visit, startsAt, endsAt }}
            onCheckIn={() => setCheckInOpen(true)}
          />
        ) : null}

        {message ? (
          <Text accessibilityLiveRegion="polite" className="px-1 text-sm text-primary">
            {message}
          </Text>
        ) : null}

        {visit.reason || visit.notes || sourceNote ? (
          <Card style={{ gap: 10 }}>
            <Detail label="Reason for visit" value={visit.reason} />
            <Detail label="Notes for the doctor" value={visit.notes} />
            {sourceNote ? <Text className="text-sm text-ink-muted">{sourceNote}</Text> : null}
          </Card>
        ) : null}

        {visit.status === "missed" ? (
          <Card style={{ gap: 6 }}>
            <Text className="text-base font-semibold text-ink">Missed visit</Text>
            <Text className="text-sm text-ink-muted">
              You didn&apos;t check in before the session ended. Book another session when you&apos;re ready,
              and cancel in the app if you can&apos;t come so someone else can have your place.
            </Text>
          </Card>
        ) : null}

        <View className="gap-2">
          {upcoming ? (
            <Pressable
              accessibilityLabel="Add to calendar"
              accessibilityRole="button"
              className="min-h-12 flex-row items-center justify-center gap-2 rounded-xl border border-primary bg-surface px-4 web:hover:opacity-90 active:opacity-80"
              onPress={() => void addToCalendar()}
            >
              <CalendarPlus color={colors.primary} size={18} />
              <Text className="text-base font-semibold text-primary">Add to calendar</Text>
            </Pressable>
          ) : null}
          {canMove ? (
            <Pressable
              accessibilityLabel={`Change session with ${doctorName}`}
              accessibilityRole="button"
              className="min-h-12 items-center justify-center rounded-xl border border-primary bg-surface px-4 web:hover:opacity-90 active:opacity-80"
              onPress={() => setMoveOpen(true)}
            >
              <Text className="text-base font-semibold text-primary">Change session</Text>
            </Pressable>
          ) : null}
          {upcoming ? (
            <Pressable
              accessibilityLabel="Cancel visit"
              accessibilityRole="button"
              accessibilityState={{ disabled: cancelAppointment.isPending }}
              className="min-h-12 items-center justify-center rounded-xl border border-ink-muted bg-surface px-4 web:hover:opacity-90 active:opacity-80"
              disabled={cancelAppointment.isPending}
              onPress={() => void cancelVisit()}
            >
              <Text className="text-base font-semibold text-ink">Cancel visit</Text>
            </Pressable>
          ) : (
            <Pressable
              accessibilityLabel={`Book again with ${doctorName}`}
              accessibilityRole="button"
              className="min-h-12 items-center justify-center rounded-xl bg-primary px-4 web:hover:opacity-90 active:opacity-80"
              onPress={bookAgain}
            >
              <Text className="text-base font-semibold text-surface">Book again</Text>
            </Pressable>
          )}
          <Pressable
            accessibilityLabel="Hospital contact details"
            accessibilityRole="link"
            className="min-h-12 flex-row items-center justify-center gap-2 web:hover:opacity-80"
            onPress={() => router.push("/about")}
          >
            <Info color={colors.primary} size={18} />
            <Text className="text-sm font-semibold text-primary">Contact the hospital</Text>
          </Pressable>
        </View>
      </ScrollView>

      {checkInOpen ? (
        <CheckInSheet
          key={visit.id}
          appointmentId={visit.id}
          doctorName={doctorName}
          initialCode={typeof code === "string" ? code : undefined}
          patientName={patientName}
          onCheckedIn={({ queueNumber }) => setMessage(`Checked in. Your number is ${queueNumber}.`)}
          onOpenChange={(open) => {
            setCheckInOpen(open);
            if (!open && code) router.setParams({ code: undefined });
          }}
        />
      ) : null}

      {moveOpen && visit.sessionId ? (
        <MoveSessionSheet
          appointmentId={visit.id}
          currentSessionId={visit.sessionId}
          doctorId={visit.doctorId}
          doctorName={doctorName}
          open={moveOpen}
          onMoved={() => setMessage("Booking moved.")}
          onOpenChange={setMoveOpen}
        />
      ) : null}
    </View>
  );
}
