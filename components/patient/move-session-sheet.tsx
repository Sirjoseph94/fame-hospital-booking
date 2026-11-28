import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { RefreshErrorNotice } from "@/components/ui/refresh-error-notice";
import { SchedulingStatePanel } from "@/components/ui/scheduling-state-panel";
import { SessionOption } from "@/components/ui/session-option";
import { Sheet } from "@/components/ui/sheet";
import { SessionListSkeleton } from "@/components/ui/skeleton";
import { useMoveBooking } from "@/lib/queries/appointments";
import { useBookableSessions } from "@/lib/queries/sessions";
import { groupSessionsByDate } from "@/lib/session-groups";
import { SchedulingError } from "@/lib/services/scheduling";

interface MoveSessionSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointmentId: string;
  doctorId: string;
  doctorName: string;
  currentSessionId?: string;
  onMoved: () => void;
}

function sessionsErrorMessage(cause: unknown): string {
  return cause instanceof SchedulingError
    ? cause.message
    : "Could not load other sessions.";
}

/** Move a booking to another session with the same doctor. */
export function MoveSessionSheet({
  open,
  onOpenChange,
  appointmentId,
  doctorId,
  doctorName,
  currentSessionId,
  onMoved,
}: MoveSessionSheetProps) {
  // Only fetch while open; places are always refetched when the query activates.
  const sessionsQuery = useBookableSessions(open ? doctorId : undefined);
  const moveBooking = useMoveBooking();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionErrorCode, setActionErrorCode] = useState<
    SchedulingError["code"] | null
  >(null);

  const rows = sessionsQuery.data;
  const sections = useMemo(
    () =>
      groupSessionsByDate(
        (rows ?? []).filter((row) => row.id !== currentSessionId && row.isBookable),
      ),
    [currentSessionId, rows],
  );

  const initialLoading = rows === undefined && sessionsQuery.isPending;
  const blockingError = sessionsQuery.isError && rows === undefined ? sessionsQuery.error : null;
  const refreshError = sessionsQuery.isError ? sessionsQuery.error : null;
  const submitting = moveBooking.isPending;

  useEffect(() => {
    if (open) {
      return;
    }
    const resetTask = setTimeout(() => {
      setSelectedId(null);
      setActionError(null);
      setActionErrorCode(null);
    }, 0);
    return () => clearTimeout(resetTask);
  }, [open]);

  const confirmMove = async () => {
    if (!selectedId) {
      return;
    }
    setActionError(null);
    setActionErrorCode(null);
    try {
      await moveBooking.mutateAsync({ appointmentId, newSessionId: selectedId });
      onMoved();
      onOpenChange(false);
    } catch (cause) {
      setActionError(
        cause instanceof SchedulingError ? cause.message : "Could not move the booking.",
      );
      setActionErrorCode(cause instanceof SchedulingError ? cause.code : null);
      if (cause instanceof SchedulingError && cause.code === "SESSION_UNAVAILABLE") {
        setSelectedId(null);
      }
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={`Change session · ${doctorName}`}
      accessibilityLabel="Change session"
    >
      <Text className="text-sm text-ink-muted">
        Pick another session with the same doctor, then confirm.
      </Text>

      {!blockingError ? (
        <RefreshErrorNotice
          message={refreshError ? sessionsErrorMessage(refreshError) : null}
        />
      ) : null}

      {initialLoading ? (
        <SessionListSkeleton count={3} />
      ) : blockingError ? (
        <SchedulingStatePanel
          compact
          message={sessionsErrorMessage(blockingError)}
          onRetry={() => void sessionsQuery.refetch()}
        />
      ) : sections.length === 0 ? (
        <Text className="text-sm text-ink-muted">
          No other sessions with places left for this doctor right now.
        </Text>
      ) : (
        <ScrollView className="max-h-80" nestedScrollEnabled>
          <View className="gap-3">
            {sections.map((section) => (
              <View key={section.dateKey} accessibilityRole="radiogroup" className="gap-2">
                <Text className="text-sm font-semibold text-ink">{section.title}</Text>
                {section.sessions.map((session) => (
                  <SessionOption
                    key={session.id}
                    selected={selectedId === session.id}
                    session={session}
                    onPress={() => setSelectedId(session.id)}
                  />
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
      )}

      {actionError ? (
        <SchedulingStatePanel
          compact
          code={actionErrorCode ?? undefined}
          message={actionError}
          onRepick={() => {
            setActionError(null);
            setActionErrorCode(null);
            void sessionsQuery.refetch();
          }}
          onRetry={actionErrorCode === "NETWORK_ERROR" ? () => void confirmMove() : undefined}
        />
      ) : null}

      <Pressable
        accessibilityLabel="Move to the selected session"
        accessibilityRole="button"
        accessibilityState={{ disabled: !selectedId || submitting, busy: submitting }}
        className={[
          "min-h-12 items-center justify-center rounded-xl px-4 web:hover:opacity-90",
          selectedId ? "bg-primary" : "bg-ink-muted opacity-60",
        ].join(" ")}
        disabled={!selectedId || submitting}
        onPress={() => void confirmMove()}
      >
        <Text className="text-base font-semibold text-surface">
          {submitting ? "Moving…" : "Move booking"}
        </Text>
      </Pressable>
    </Sheet>
  );
}
