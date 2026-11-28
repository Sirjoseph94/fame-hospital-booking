import { useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, ScrollView, Text, View } from "react-native";
import { Stack, router } from "expo-router";

import { JoinWaitlistSheet } from "@/components/patient/join-waitlist-sheet";
import { RefreshErrorNotice } from "@/components/ui/refresh-error-notice";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SchedulingStatePanel } from "@/components/ui/scheduling-state-panel";
import { SessionOption } from "@/components/ui/session-option";
import { SessionListSkeleton } from "@/components/ui/skeleton";
import { useHospitalSettings } from "@/lib/queries/hospital-settings";
import { useBookableSessions } from "@/lib/queries/sessions";
import { groupSessionsByDate } from "@/lib/session-groups";
import { useBookingStore } from "@/lib/stores/booking";
import { SchedulingError } from "@/lib/services/scheduling";
import type { ClinicSession } from "@/types/scheduling";

const EMPTY_SESSIONS: ClinicSession[] = [];

function sessionsErrorMessage(cause: unknown): string {
  return cause instanceof SchedulingError
    ? cause.message
    : "Could not load clinic sessions.";
}

export default function BookSessionScreen() {
  const doctorId = useBookingStore((state) => state.doctorId);
  const doctorName = useBookingStore((state) => state.doctorName);
  const selected = useBookingStore((state) => state.session);
  const skipIntake = useBookingStore((state) => state.skipIntake);
  const setSession = useBookingStore((state) => state.setSession);
  const beneficiaryId = useBookingStore((state) => state.beneficiaryId);
  const settingsQuery = useHospitalSettings();
  const waitlistEnabled = settingsQuery.data?.waitlistEnabled ?? true;
  const [waitlistSession, setWaitlistSession] = useState<ClinicSession | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const sessionsQuery = useBookableSessions(doctorId ?? undefined);
  const sessions = sessionsQuery.data ?? EMPTY_SESSIONS;
  const initialLoading = sessionsQuery.data === undefined && sessionsQuery.isPending;
  const blockingError =
    sessionsQuery.isError && sessionsQuery.data === undefined ? sessionsQuery.error : null;
  const refreshError = sessionsQuery.isError ? sessionsQuery.error : null;

  const sections = useMemo(() => groupSessionsByDate(sessions), [sessions]);

  const didRedirect = useRef(false);
  useEffect(() => {
    if (!doctorId && !didRedirect.current) {
      didRedirect.current = true;
      router.replace("/");
    }
  }, [doctorId]);

  const choose = (session: ClinicSession) => {
    if (!session.isBookable) {
      if (waitlistEnabled && beneficiaryId) {
        setWaitlistSession(session);
      }
      return;
    }
    setSession({ id: session.id, startsAt: session.startsAt, endsAt: session.endsAt });
    router.push(skipIntake ? "/book/confirmation" : "/book/intake");
  };

  const header = (
    <Card style={{ gap: 4 }}>
      <Text className="text-lg font-semibold text-ink">{doctorName}</Text>
      <Text className="text-sm text-ink-muted">
        Pick a clinic session. Patients are seen in order of arrival during the
        session, so there&apos;s no fixed appointment time.
        {waitlistEnabled ? " Full sessions have a waitlist." : ""}
      </Text>
    </Card>
  );

  return (
    <>
      <Stack.Screen options={{ title: "Pick a session" }} />
      {initialLoading ? (
        <View className="flex-1 gap-4 bg-surface-muted px-4 py-4">
          {header}
          <SessionListSkeleton />
        </View>
      ) : blockingError ? (
        <View className="flex-1 justify-center bg-surface-muted px-4">
          <SchedulingStatePanel
            message={sessionsErrorMessage(blockingError)}
            onRetry={() => void sessionsQuery.refetch()}
          />
        </View>
      ) : (
        <ScrollView
          className="flex-1 bg-surface-muted"
          contentContainerClassName="gap-4 px-4 py-4"
          contentInsetAdjustmentBehavior="automatic"
        >
          {header}
          <RefreshErrorNotice
            message={refreshError ? sessionsErrorMessage(refreshError) : null}
          />
          {notice ? (
            <Card>
              <Text accessibilityLiveRegion="polite" className="text-base text-ink">
                {notice}
              </Text>
            </Card>
          ) : null}

          {sections.length === 0 ? (
            <EmptyState message="This doctor has no upcoming sessions you can book yet. Try another doctor, or check back later." />
          ) : (
            sections.map((section) => (
              <View
                key={section.dateKey}
                accessibilityLabel={`Sessions on ${section.title}`}
                accessibilityRole="radiogroup"
                className="gap-2"
              >
                <Text className="text-sm font-semibold text-ink">{section.title}</Text>
                {section.sessions.map((session) => (
                  <SessionOption
                    key={session.id}
                    disabled={!session.isBookable && !waitlistEnabled}
                    note={
                      session.isBookable
                        ? undefined
                        : waitlistEnabled
                          ? `Full · ${session.waitlistCount > 0 ? `${session.waitlistCount} waiting · ` : ""}tap to join the waitlist`
                          : "Full"
                    }
                    selected={selected?.id === session.id}
                    session={session}
                    onPress={() => choose(session)}
                  />
                ))}
              </View>
            ))
          )}
        </ScrollView>
      )}
      {waitlistSession && beneficiaryId ? (
        <JoinWaitlistSheet
          key={waitlistSession.id}
          beneficiaryId={beneficiaryId}
          doctorName={doctorName ?? "Doctor"}
          session={waitlistSession}
          onJoined={(position) => {
            const text =
              position === 1
                ? "You're first on the waitlist. We'll book you and let you know if a place frees up."
                : `You're number ${position} on the waitlist. We'll book you and let you know if a place frees up.`;
            setNotice(text);
            AccessibilityInfo.announceForAccessibility(text);
          }}
          onOpenChange={(open) => {
            if (!open) setWaitlistSession(null);
          }}
        />
      ) : null}
    </>
  );
}
