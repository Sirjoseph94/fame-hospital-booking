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
import { format, parseISO } from "date-fns";
import QRCode from "react-native-qrcode-svg";

import { Card } from "@/components/ui/card";
import { useConfirmBooking } from "@/lib/queries/appointments";
import { useBeneficiaries } from "@/lib/queries/beneficiaries";
import { exportAppointmentToCalendar } from "@/lib/services/calendarExport";
import { useBookingStore } from "@/lib/stores/booking";
import { useSessionStore } from "@/lib/stores/session";
import { SchedulingStatePanel } from "@/components/ui/scheduling-state-panel";
import {
  SchedulingError,
  type SchedulingErrorCode,
} from "@/lib/services/scheduling";
import type { Appointment } from "@/types/scheduling";
import { colors } from "@/lib/theme-colors";

export default function BookConfirmationScreen() {
  const session = useSessionStore((state) => state.session);
  const draft = useBookingStore();
  const resetBookingDraft = useBookingStore((state) => state.resetBookingDraft);

  const confirmBooking = useConfirmBooking();
  const submitting = confirmBooking.isPending;
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<SchedulingErrorCode | null>(null);
  const [confirmed, setConfirmed] = useState<Appointment | null>(null);
  const [calendarMessage, setCalendarMessage] = useState<string | null>(null);
  const beneficiariesQuery = useBeneficiaries(
    draft.beneficiaryId ? session?.userId : undefined,
  );
  const beneficiaryName =
    beneficiariesQuery.data?.find((row) => row.id === draft.beneficiaryId)
      ?.displayName ?? null;

  useEffect(() => {
    if (!draft.slotId || !draft.hold || !draft.doctorId || !draft.beneficiaryId) {
      const task = setTimeout(() => router.replace("/"), 0);
      return () => clearTimeout(task);
    }
  }, [draft.beneficiaryId, draft.doctorId, draft.hold, draft.slotId]);

  const confirm = async () => {
    if (
      !session ||
      !draft.beneficiaryId ||
      !draft.doctorId ||
      !draft.slotId ||
      !draft.hold
    ) {
      setError("Booking details are incomplete. Start again from Home.");
      return;
    }

    if (confirmBooking.isPending) {
      return;
    }
    setError(null);
    setErrorCode(null);
    try {
      const appointment = await confirmBooking.mutateAsync({
        accountHolderId: session.userId,
        beneficiaryId: draft.beneficiaryId,
        doctorId: draft.doctorId,
        slotId: draft.slotId,
        type: draft.appointmentType,
        hold: draft.hold,
        reason: draft.reason,
        notes: draft.notes,
        address:
          draft.appointmentType === "home-visit"
            ? draft.visitAddress
            : undefined,
      });
      setConfirmed(appointment);
      AccessibilityInfo.announceForAccessibility("Booking submitted.");
    } catch (cause) {
      const message =
        cause instanceof SchedulingError
          ? cause.message
          : "Could not confirm the appointment.";
      setError(message);
      setErrorCode(cause instanceof SchedulingError ? cause.code : null);
      AccessibilityInfo.announceForAccessibility(message);
    }
  };

  const addToCalendar = async () => {
    if (!confirmed?.startsAt && !draft.slotStartsAt) {
      return;
    }
    const result = await exportAppointmentToCalendar({
      appointmentId: confirmed?.id ?? "",
      title: `Visit with ${draft.doctorName ?? "your doctor"}`,
      startsAt: confirmed?.startsAt ?? draft.slotStartsAt ?? new Date().toISOString(),
      durationMin: 30,
      type: confirmed?.type ?? draft.appointmentType,
      room: confirmed?.room,
    });
    if (result.ok) {
      setCalendarMessage("Added to your calendar.");
    } else {
      setCalendarMessage(result.message);
    }
    AccessibilityInfo.announceForAccessibility(
      result.ok ? "Added to calendar." : result.message,
    );
  };

  if (confirmed) {
    return (
      <>
        <Stack.Screen options={{ title: "Confirmed" }} />
        <ScrollView
          className="flex-1 bg-surface-muted"
          contentContainerClassName="items-center gap-4 px-4 py-6"
          contentInsetAdjustmentBehavior="automatic"
        >
          <Card style={{ gap: 12, alignItems: "center", width: "100%" }}>
            <Text className="text-lg font-semibold text-ink">
              Booking submitted
            </Text>
            <Text className="text-center text-sm text-ink-muted">
              Your doctor will confirm the visit. Check My Visits for updates.
            </Text>
            {beneficiaryName ? (
              <Text className="text-sm text-ink" selectable>
                Patient: {beneficiaryName}
              </Text>
            ) : null}
            <View
              accessibilityLabel={`Check-in QR code for appointment ${confirmed.id}`}
            >
              <QRCode size={160} value={confirmed.id} />
            </View>
            <Text className="text-sm text-ink-muted" selectable>
              Appointment ID: {confirmed.id}
            </Text>
            <Pressable
              accessibilityLabel="Add appointment to calendar"
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
          <Text className="text-base text-ink" selectable>
            {draft.slotStartsAt
              ? format(parseISO(draft.slotStartsAt), "EEE, MMM d · h:mm a")
              : "Selected slot"}
          </Text>
          <Text className="text-sm capitalize text-ink-muted">
            {draft.appointmentType.replace("-", " ")}
          </Text>
          {draft.appointmentType === "telehealth" ? (
            <Text className="text-xs text-ink-muted">
              Your doctor will add a video link when they confirm this visit.
            </Text>
          ) : null}
        </Card>

        {error ? (
          <SchedulingStatePanel
            compact
            code={errorCode ?? undefined}
            message={error}
            onRepick={() => router.replace("/book/slot")}
            onRetry={
              errorCode === "NETWORK_ERROR" ? () => void confirm() : undefined
            }
          />
        ) : null}

        <Pressable
          accessibilityLabel="Confirm appointment"
          accessibilityRole="button"
          accessibilityState={{ busy: submitting, disabled: submitting }}
          className="min-h-12 items-center justify-center rounded-xl bg-primary px-4 web:hover:opacity-90"
          disabled={submitting}
          onPress={() => void confirm()}
        >
          {submitting ? (
            <ActivityIndicator color={colors.surface} />
          ) : (
            <Text className="text-base font-semibold text-surface">Confirm</Text>
          )}
        </Pressable>
      </ScrollView>
    </>
  );
}
