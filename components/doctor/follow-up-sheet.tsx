import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { addDays, format } from "date-fns";

import { FormTextInput } from "@/components/ui/form-text-input";
import { SchedulingStatePanel } from "@/components/ui/scheduling-state-panel";
import { SessionOption } from "@/components/ui/session-option";
import { Sheet } from "@/components/ui/sheet";
import { SessionListSkeleton } from "@/components/ui/skeleton";
import { useDoctorSessions } from "@/lib/queries/sessions";
import { useNow } from "@/lib/hooks/use-now";
import { useBookFollowUp } from "@/lib/queries/visit-flow";
import { groupSessionsByDate } from "@/lib/session-groups";
import { SchedulingError } from "@/lib/services/scheduling";

/** How far ahead follow-ups can be booked from this sheet. */
const FOLLOW_UP_DAYS = 120;

interface FollowUpSheetProps {
  /** Render with key={appointmentId} so the form resets per patient. */
  appointmentId: string;
  doctorId: string;
  /** The session of the original visit (not offered again). */
  currentSessionId?: string;
  patientName: string;
  onOpenChange: (open: boolean) => void;
  onBooked: (message: string) => void;
}

/** Doctor/admin: book the same patient into one of the doctor's future sessions. */
export function FollowUpSheet({
  appointmentId,
  doctorId,
  currentSessionId,
  patientName,
  onOpenChange,
  onBooked,
}: FollowUpSheetProps) {
  const fromYmd = format(new Date(), "yyyy-MM-dd");
  const toYmd = format(addDays(new Date(), FOLLOW_UP_DAYS), "yyyy-MM-dd");
  const sessionsQuery = useDoctorSessions(doctorId, fromYmd, toYmd);
  const book = useBookFollowUp();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const now = useNow(60_000);
  const sections = useMemo(() => {
    const open = (sessionsQuery.data ?? []).filter(
      (session) =>
        session.status === "scheduled" &&
        session.id !== currentSessionId &&
        new Date(session.endsAt).getTime() > now,
    );
    return groupSessionsByDate(open);
  }, [currentSessionId, now, sessionsQuery.data]);

  const submit = async () => {
    if (!selectedId) return;
    setError(null);
    try {
      const booked = await book.mutateAsync({ appointmentId, sessionId: selectedId, note });
      const when = booked.startsAt ? format(new Date(booked.startsAt), "EEE d MMM") : "the new session";
      onBooked(`Follow-up booked for ${patientName} on ${when}. They've been told.`);
      onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof SchedulingError ? cause.message : "Could not book the follow-up.");
      if (cause instanceof SchedulingError && cause.code === "SESSION_UNAVAILABLE") {
        setSelectedId(null);
      }
    }
  };

  return (
    <Sheet open onOpenChange={onOpenChange} title={`Follow-up · ${patientName}`} accessibilityLabel="Book follow-up">
      <Text className="text-sm text-ink-muted">
        Choose a session with the same doctor. The patient gets a message and can change or
        cancel it. A full session can take more patients once its patient limit is raised.
      </Text>
      {sessionsQuery.isPending ? (
        <SessionListSkeleton count={3} />
      ) : sessionsQuery.isError ? (
        <SchedulingStatePanel compact message="Could not load your sessions." onRetry={() => void sessionsQuery.refetch()} />
      ) : sections.length === 0 ? (
        <Text className="text-sm text-ink-muted">
          No upcoming sessions in the next {FOLLOW_UP_DAYS} days. Add a session to the schedule first.
        </Text>
      ) : (
        <View className="gap-3">
          {sections.map((section) => (
            <View key={section.dateKey} className="gap-2">
              <Text className="text-sm font-semibold text-ink">{section.title}</Text>
              {section.sessions.map((session) => (
                <SessionOption
                  key={session.id}
                  disabled={session.placesLeft <= 0}
                  note={session.placesLeft <= 0 ? "Full" : undefined}
                  selected={selectedId === session.id}
                  session={session}
                  onPress={() => setSelectedId(session.id)}
                />
              ))}
            </View>
          ))}
        </View>
      )}
      <View className="gap-1">
        <Text className="text-sm font-medium text-ink">Note for the visit (optional)</Text>
        <FormTextInput
          accessibilityLabel="Note for the follow-up visit"
          maxLength={200}
          onChangeText={setNote}
          placeholder="e.g. Review blood test results"
          value={note}
        />
      </View>
      {error ? (
        <Text accessibilityLiveRegion="assertive" className="text-sm text-danger">
          {error}
        </Text>
      ) : null}
      <Pressable
        accessibilityLabel="Book follow-up"
        accessibilityRole="button"
        accessibilityState={{ disabled: !selectedId || book.isPending, busy: book.isPending }}
        className={[
          "min-h-12 items-center justify-center rounded-xl px-4 web:hover:opacity-90",
          selectedId ? "bg-primary" : "bg-ink-muted opacity-60",
        ].join(" ")}
        disabled={!selectedId || book.isPending}
        onPress={() => void submit()}
      >
        <Text className="text-base font-semibold text-surface">{book.isPending ? "Booking…" : "Book follow-up"}</Text>
      </Pressable>
    </Sheet>
  );
}
