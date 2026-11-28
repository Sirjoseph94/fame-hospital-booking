import { useState, type ReactNode } from "react";
import { AccessibilityInfo, Pressable, Text, View } from "react-native";
import { Megaphone } from "lucide-react-native";

import { DoctorVisitCard, type VisitCardAction } from "@/components/doctor/doctor-visit-card";
import { FollowUpSheet } from "@/components/doctor/follow-up-sheet";
import { confirmAsync, showAlert } from "@/lib/confirm";
import type { DoctorAgendaVisit } from "@/lib/doctor-agenda-helpers";
import { useCancelAppointment } from "@/lib/queries/appointments";
import { useHospitalSettings } from "@/lib/queries/hospital-settings";
import { useNow } from "@/lib/hooks/use-now";
import { useAdvanceVisit, useCallNext } from "@/lib/queries/visit-flow";
import { SchedulingError, type VisitAction } from "@/lib/services/scheduling";
import { buildQueueSections, queueActions, type QueueActionId } from "@/lib/session-queue";
import { colors } from "@/lib/theme-colors";
import { visitStage } from "@/lib/visit-status-label";
import type { ClinicSession } from "@/types/scheduling";

interface SessionQueueProps {
  session: Pick<ClinicSession, "id" | "doctorId" | "startsAt" | "endsAt" | "status">;
  /** Live (non-cancelled) bookings in this session. */
  visits: DoctorAgendaVisit[];
  audience: "doctor" | "admin";
  /** Shown after an action succeeds. */
  onMessage: (message: string) => void;
  /**
   * Bookings made before clinic sessions: no check-in or queue, only
   * "mark seen" (once started) and cancel.
   */
  legacy?: boolean;
}

function errorText(cause: unknown, fallback: string): string {
  return cause instanceof SchedulingError ? cause.message : fallback;
}

const ACTION_MESSAGES: Record<VisitAction, (name: string) => string> = {
  arrive: (name) => `${name} marked as arrived.`,
  call: (name) => `${name} called in. They've been notified.`,
  complete: (name) => `${name} marked as seen.`,
  no_show: (name) => `${name} recorded as a no-show.`,
  requeue: (name) => `${name} is back in the queue.`,
};

function Section({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  if (count === 0) return null;
  return (
    <View className="gap-2">
      <Text accessibilityRole="header" className="px-1 text-sm font-semibold uppercase tracking-wide text-ink-muted">
        {title} · {count}
      </Text>
      {children}
    </View>
  );
}

/**
 * A session's patients in queue order with the actions for each stage:
 * mark arrived, call in, seen, no-show, follow-up, cancel.
 */
export function SessionQueue({ session, visits, audience, onMessage, legacy = false }: SessionQueueProps) {
  const settingsQuery = useHospitalSettings();
  const advance = useAdvanceVisit();
  const callNext = useCallNext();
  const cancel = useCancelAppointment();
  const [followUpFor, setFollowUpFor] = useState<DoctorAgendaVisit | null>(null);
  const [showDone, setShowDone] = useState(false);
  // Actions unlock as check-in opens and the session starts.
  const now = useNow(60_000);

  const sections = buildQueueSections(visits);
  const clock = {
    startsAt: session.startsAt,
    endsAt: session.endsAt,
    checkInOpensMinutes: settingsQuery.data?.checkInOpensMinutes ?? 120,
  };
  const busyId = advance.isPending
    ? advance.variables?.appointmentId
    : cancel.isPending
      ? cancel.variables
      : null;
  const cancelled = session.status === "cancelled";

  const announce = (message: string) => {
    onMessage(message);
    AccessibilityInfo.announceForAccessibility(message);
  };

  const run = async (visit: DoctorAgendaVisit, action: VisitAction) => {
    if (action === "no_show") {
      const confirmed = await confirmAsync({
        title: `Record ${visit.beneficiaryName} as a no-show?`,
        message: "They'll be told they missed the visit.",
        confirmText: "Record no-show",
        cancelText: "Not now",
        destructive: true,
      });
      if (!confirmed) return;
    }
    try {
      await advance.mutateAsync({ appointmentId: visit.id, action });
      announce(ACTION_MESSAGES[action](visit.beneficiaryName));
    } catch (cause) {
      showAlert("Could not update the visit", errorText(cause, "Try again."));
    }
  };

  const cancelBooking = async (visit: DoctorAgendaVisit) => {
    const confirmed = await confirmAsync({
      title: "Cancel this booking?",
      message: `${visit.beneficiaryName} will be notified and their place released.`,
      confirmText: "Cancel booking",
      cancelText: "Keep booking",
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await cancel.mutateAsync(visit.id);
      announce("Booking cancelled.");
    } catch (cause) {
      showAlert("Cancel failed", errorText(cause, "Could not cancel the booking."));
    }
  };

  const callNextPatient = async () => {
    try {
      const appointmentId = await callNext.mutateAsync(session.id);
      const visit = visits.find((row) => row.id === appointmentId);
      announce(visit ? ACTION_MESSAGES.call(visit.beneficiaryName) : "Next patient called.");
    } catch (cause) {
      showAlert("Could not call the next patient", errorText(cause, "Try again."));
    }
  };

  const actionsFor = (visit: DoctorAgendaVisit): VisitCardAction[] => {
    if (cancelled) return [];
    const name = visit.beneficiaryName;
    const stage = visitStage(visit);
    const ids: QueueActionId[] = legacy
      ? stage === "booked"
        ? Date.parse(visit.startsAt) <= now
          ? ["complete", "cancel"]
          : ["cancel"]
        : []
      : queueActions(stage, clock, new Date(now));
    const build: Record<QueueActionId, VisitCardAction> = {
      arrive: { key: "arrive", label: "Mark arrived", accessibilityLabel: `Mark ${name} arrived`, tone: "primary", onPress: () => void run(visit, "arrive") },
      call: { key: "call", label: "Call in", accessibilityLabel: `Call ${name} in`, tone: "primary", onPress: () => void run(visit, "call") },
      complete: { key: "complete", label: "Mark seen", accessibilityLabel: `Mark ${name} seen`, tone: visit.calledAt ? "primary" : "secondary", onPress: () => void run(visit, "complete") },
      no_show: { key: "no_show", label: "No-show", accessibilityLabel: `Record ${name} as a no-show`, tone: "danger", onPress: () => void run(visit, "no_show") },
      requeue: { key: "requeue", label: "Back to queue", accessibilityLabel: `Put ${name} back in the queue`, onPress: () => void run(visit, "requeue") },
      follow_up: { key: "follow_up", label: "Book follow-up", accessibilityLabel: `Book a follow-up for ${name}`, onPress: () => setFollowUpFor(visit) },
      cancel: { key: "cancel", label: "Cancel booking", accessibilityLabel: `Cancel ${name}'s booking`, onPress: () => void cancelBooking(visit) },
    };
    return ids.map((id) => build[id]);
  };

  const renderCard = (visit: DoctorAgendaVisit, highlight = false) => (
    <DoctorVisitCard
      key={visit.id}
      actions={actionsFor(visit)}
      appointment={visit}
      audience={audience}
      beneficiaryName={visit.beneficiaryName}
      busy={busyId === visit.id}
      highlight={highlight}
      proxyTag={visit.proxyTag}
      startsAt={visit.startsAt}
    />
  );

  const waitingCount = sections.waiting.length;

  return (
    <View className="gap-4">
      {!cancelled && !legacy && waitingCount > 0 ? (
        <Pressable
          accessibilityHint="Calls the patient who arrived first and notifies them"
          accessibilityLabel={`Call next patient. ${waitingCount} waiting`}
          accessibilityRole="button"
          accessibilityState={{ busy: callNext.isPending, disabled: callNext.isPending }}
          className="min-h-14 flex-row items-center justify-center gap-2 rounded-xl bg-available px-4 web:hover:opacity-90 active:opacity-80"
          disabled={callNext.isPending}
          onPress={() => void callNextPatient()}
        >
          <Megaphone color={colors.surface} size={20} />
          <Text className="text-base font-bold text-surface">
            {callNext.isPending ? "Calling…" : `Call next · ${sections.waiting[0]!.beneficiaryName}`}
          </Text>
        </Pressable>
      ) : null}

      <Section count={sections.withDoctor.length} title="With doctor">
        {sections.withDoctor.map((visit) => renderCard(visit, true))}
      </Section>
      <Section count={waitingCount} title="Waiting (arrival order)">
        {sections.waiting.map((visit) => renderCard(visit))}
      </Section>
      <Section count={sections.notArrived.length} title="Not arrived yet">
        {sections.notArrived.map((visit) => renderCard(visit))}
      </Section>
      {sections.done.length > 0 ? (
        <View className="gap-2">
          <Pressable
            accessibilityLabel={showDone ? "Hide finished visits" : "Show finished visits"}
            accessibilityRole="button"
            accessibilityState={{ expanded: showDone }}
            className="min-h-11 justify-center px-1 web:hover:opacity-80"
            onPress={() => setShowDone((value) => !value)}
          >
            <Text className="text-sm font-semibold text-primary">
              {showDone ? "Hide" : "Show"} finished · {sections.done.length}
            </Text>
          </Pressable>
          {showDone ? sections.done.map((visit) => renderCard(visit)) : null}
        </View>
      ) : null}

      {followUpFor ? (
        <FollowUpSheet
          key={followUpFor.id}
          appointmentId={followUpFor.id}
          currentSessionId={followUpFor.sessionId}
          doctorId={session.doctorId}
          patientName={followUpFor.beneficiaryName}
          onBooked={announce}
          onOpenChange={(open) => {
            if (!open) setFollowUpFor(null);
          }}
        />
      ) : null}
    </View>
  );
}
