import { useEffect, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { Stack, router } from "expo-router";
import { differenceInMinutes, parseISO } from "date-fns";

import { Card } from "@/components/ui/card";
import { SchedulingStatePanel } from "@/components/ui/scheduling-state-panel";
import { useBookSession } from "@/lib/queries/appointments";
import { useBeneficiaries } from "@/lib/queries/beneficiaries";
import { useHospitalInfo } from "@/lib/queries/hospital-info";
import { exportAppointmentToCalendar } from "@/lib/services/calendarExport";
import {
  SchedulingError,
  type SchedulingErrorCode,
} from "@/lib/services/scheduling";
import { formatSessionWhen } from "@/lib/session-groups";
import { useBookingStore } from "@/lib/stores/booking";
import { useSessionStore } from "@/lib/stores/session";
import { colors } from "@/lib/theme-colors";
import type { Appointment } from "@/types/scheduling";

const ARRIVAL_NOTE =
  "Patients are seen in order of arrival during the session. When you arrive, check in with the app by scanning the code at reception.";

export default function BookConfirmationScreen() {
  const session = useSessionStore((state) => state.session);
  const { data: hospitalInfo } = useHospitalInfo();
  const draft = useBookingStore();
  const resetBookingDraft = useBookingStore((state) => state.resetBookingDraft);
  const setDraftSession = useBookingStore((state) => state.setSession);

  const bookSession = useBookSession();
  const submitting = bookSession.isPending;
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<SchedulingErrorCode | null>(null);
  const [booked, setBooked] = useState<Appointment | null>(null);
  const [calendarMessage, setCalendarMessage] = useState<string | null>(null);
  const beneficiariesQuery = useBeneficiaries(
    draft.beneficiaryId ? session?.userId : undefined,
  );
  const beneficiaryName =
    beneficiariesQuery.data?.find((row) => row.id === draft.beneficiaryId)
      ?.displayName ?? null;

  const incomplete = !draft.session || !draft.doctorId || !draft.beneficiaryId;
  useEffect(() => {
    if (incomplete && !booked) {
      const task = setTimeout(() => router.replace("/"), 0);
      return () => clearTimeout(task);
    }
  }, [booked, incomplete]);

  const book = async () => {
    if (!session || !draft.beneficiaryId || !draft.session) {
      setError("Booking details are incomplete. Start again from Home.");
      return;
    }
    if (bookSession.isPending) {
      return;
    }
    setError(null);
    setErrorCode(null);
    try {
      const appointment = await bookSession.mutateAsync({
        accountHolderId: session.userId,
        beneficiaryId: draft.beneficiaryId,
        sessionId: draft.session.id,
        reason: draft.reason,
        notes: draft.notes,
      });
      setBooked(appointment);
      AccessibilityInfo.announceForAccessibility("You're booked.");
    } catch (cause) {
      const message =
        cause instanceof SchedulingError
          ? cause.message
          : "Could not book the session.";
      setError(message);
      setErrorCode(cause instanceof SchedulingError ? cause.code : null);
      AccessibilityInfo.announceForAccessibility(message);
    }
  };

  const visitWindow = booked?.startsAt && booked.endsAt
    ? { startsAt: booked.startsAt, endsAt: booked.endsAt }
    : draft.session;

  const addToCalendar = async () => {
    if (!booked || !visitWindow) {
      return;
    }
    const result = await exportAppointmentToCalendar({
      appointmentId: booked.id,
      title: `Clinic with ${draft.doctorName ?? "your doctor"}`,
      startsAt: visitWindow.startsAt,
      durationMin: Math.max(
        differenceInMinutes(parseISO(visitWindow.endsAt), parseISO(visitWindow.startsAt)),
        15,
      ),
      type: booked.type,
      room: booked.room,
      note: ARRIVAL_NOTE,
      hospitalName: hospitalInfo?.name,
      hospitalAddress: hospitalInfo?.address,
    });
    setCalendarMessage(result.ok ? "Added to your calendar." : result.message);
    AccessibilityInfo.announceForAccessibility(
      result.ok ? "Added to calendar." : result.message,
    );
  };

  if (booked) {
    return (
      <>
        <Stack.Screen options={{ title: "Booked" }} />
        <ScrollView
          className="flex-1 bg-surface-muted"
          contentContainerClassName="items-center gap-4 px-4 py-6"
          contentInsetAdjustmentBehavior="automatic"
        >
          <Card style={{ gap: 12, width: "100%" }}>
            <Text accessibilityRole="header" className="text-lg font-semibold text-ink">
              You&apos;re booked
            </Text>
            <View className="gap-1">
              <Text className="text-base text-ink" selectable>
                {draft.doctorName}
              </Text>
              {visitWindow ? (
                <Text className="text-base font-semibold text-ink" selectable>
                  {formatSessionWhen(visitWindow)}
                </Text>
              ) : null}
              {booked.room ? (
                <Text className="text-sm text-ink" selectable>
                  {/^\d/.test(booked.room) ? `Room ${booked.room}` : booked.room}
                </Text>
              ) : null}
              {beneficiaryName ? (
                <Text className="text-sm text-ink-muted" selectable>
                  Patient: {beneficiaryName}
                </Text>
              ) : null}
            </View>
            <Text className="text-sm leading-5 text-ink">{ARRIVAL_NOTE}</Text>
            <Text className="text-xs text-ink-muted" selectable>
              Booking reference: {booked.id.slice(0, 8).toUpperCase()}
            </Text>
            <Pressable
              accessibilityLabel="Add to calendar"
              accessibilityRole="button"
              className="min-h-12 w-full items-center justify-center rounded-xl border border-primary px-4 web:hover:opacity-90"
              onPress={() => void addToCalendar()}
            >
              <Text className="font-semibold text-primary">Add to calendar</Text>
            </Pressable>
            {calendarMessage ? (
              <Text accessibilityLiveRegion="polite" className="text-sm text-ink">
                {calendarMessage}
              </Text>
            ) : null}
            <Pressable
              accessibilityLabel="View this visit"
              accessibilityRole="button"
              className="min-h-12 w-full items-center justify-center rounded-xl border border-primary px-4 web:hover:opacity-90"
              onPress={() => {
                resetBookingDraft();
                router.replace({ pathname: "/visit/[id]", params: { id: booked.id } });
              }}
            >
              <Text className="font-semibold text-primary">View visit</Text>
            </Pressable>
            <Pressable
              accessibilityLabel="Return to home"
              accessibilityRole="button"
              className="min-h-12 w-full items-center justify-center rounded-xl bg-primary px-4 web:hover:opacity-90"
              onPress={() => {
                resetBookingDraft();
                router.replace("/");
              }}
            >
              <Text className="font-semibold text-surface">Done</Text>
            </Pressable>
          </Card>
        </ScrollView>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: "Confirm booking" }} />
      <ScrollView
        className="flex-1 bg-surface-muted"
        contentContainerClassName="gap-4 px-4 py-4"
        contentInsetAdjustmentBehavior="automatic"
      >
        <Card style={{ gap: 8 }}>
          <Text className="text-lg font-semibold text-ink">Summary</Text>
          {beneficiaryName ? (
            <Text className="text-sm text-ink" selectable>
              For {beneficiaryName}
            </Text>
          ) : null}
          <Text className="text-sm text-ink-muted">{draft.doctorName}</Text>
          <Text className="text-base font-semibold text-ink" selectable>
            {draft.session ? formatSessionWhen(draft.session) : "Selected session"}
          </Text>
          {draft.reason.trim() ? (
            <Text className="text-sm text-ink-muted" selectable>
              Reason: {draft.reason.trim()}
            </Text>
          ) : null}
          <Text className="text-sm leading-5 text-ink-muted">{ARRIVAL_NOTE}</Text>
        </Card>

        {error ? (
          <SchedulingStatePanel
            compact
            code={errorCode ?? undefined}
            message={error}
            onRepick={() => {
              setDraftSession(null);
              router.replace("/book/session");
            }}
            onRetry={errorCode === "NETWORK_ERROR" ? () => void book() : undefined}
          />
        ) : null}

        <Pressable
          accessibilityLabel="Book this session"
          accessibilityRole="button"
          accessibilityState={{ busy: submitting, disabled: submitting }}
          className="min-h-12 items-center justify-center rounded-xl bg-primary px-4 web:hover:opacity-90"
          disabled={submitting}
          onPress={() => void book()}
        >
          {submitting ? (
            <ActivityIndicator color={colors.surface} />
          ) : (
            <Text className="text-base font-semibold text-surface">Book</Text>
          )}
        </Pressable>
      </ScrollView>
    </>
  );
}
