import { useMemo, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { addDays, format, getDay, parseISO } from "date-fns";

import { SessionFormCard } from "@/components/doctor/session-form-card";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SchedulingStatePanel } from "@/components/ui/scheduling-state-panel";
import { CardSkeleton, ScreenLoadingSkeleton } from "@/components/ui/skeleton";
import { RefreshErrorNotice } from "@/components/ui/refresh-error-notice";
import { confirmAsync } from "@/lib/confirm";
import { useDoctor, useSetDoctorAcceptingBookings } from "@/lib/queries/doctors";
import {
  useCancelSession,
  useCreateSessions,
  useDoctorSessions,
} from "@/lib/queries/sessions";
import { SchedulingError } from "@/lib/services/scheduling";
import { formatSessionTimes, groupSessionsByDate } from "@/lib/session-groups";
import {
  clinicSessionFormSchema,
  type ClinicSessionFormFields,
} from "@/lib/validation/forms";
import type { ClinicSession } from "@/types/scheduling";

/** How far ahead the session list looks. */
const LIST_DAYS = 56;

interface DoctorSchedulePanelProps {
  doctorId: string;
  intro?: string;
}

function errorText(cause: unknown, fallback: string): string {
  return cause instanceof SchedulingError ? cause.message : fallback;
}

function defaultValues(): ClinicSessionFormFields {
  const today = format(new Date(), "yyyy-MM-dd");
  return {
    firstDate: today,
    startTime: "09:00",
    endTime: "13:00",
    capacity: "20",
    repeatWeekly: false,
    weekdays: [getDay(new Date())],
    weeks: "4",
  };
}

export function DoctorSchedulePanel({ doctorId, intro }: DoctorSchedulePanelProps) {
  const [userRefreshing, setUserRefreshing] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [listMessage, setListMessage] = useState<string | null>(null);

  const fromYmd = format(new Date(), "yyyy-MM-dd");
  const toYmd = format(addDays(new Date(), LIST_DAYS), "yyyy-MM-dd");

  const doctorQuery = useDoctor(doctorId);
  const sessionsQuery = useDoctorSessions(doctorId, fromYmd, toYmd);
  const createSessions = useCreateSessions();
  const cancelSession = useCancelSession();
  const setAccepting = useSetDoctorAcceptingBookings(doctorId);

  const acceptingBookings = doctorQuery.data?.acceptingBookingsFlag ?? true;
  const sessions = sessionsQuery.data;
  const sections = useMemo(() => groupSessionsByDate(sessions ?? []), [sessions]);
  const cancellingId = cancelSession.isPending ? cancelSession.variables?.sessionId : null;

  const initialLoading = doctorQuery.isPending || sessionsQuery.isPending;
  const blockingError =
    (doctorQuery.error && !doctorQuery.data ? doctorQuery.error : null) ??
    (sessionsQuery.error && !sessions ? sessionsQuery.error : null);
  const refreshError =
    (doctorQuery.error && doctorQuery.data ? doctorQuery.error : null) ??
    (sessionsQuery.error && sessions ? sessionsQuery.error : null);

  const { control, handleSubmit, reset } = useForm<ClinicSessionFormFields>({
    resolver: zodResolver(clinicSessionFormSchema),
    defaultValues: defaultValues(),
  });

  const refetchAll = () => Promise.all([doctorQuery.refetch(), sessionsQuery.refetch()]);
  const refresh = async () => {
    setUserRefreshing(true);
    try {
      await refetchAll();
    } finally {
      setUserRefreshing(false);
    }
  };

  const submit = async (values: ClinicSessionFormFields) => {
    setFormError(null);
    setSuccessMessage(null);
    try {
      const result = await createSessions.mutateAsync({
        doctorId,
        firstDateYmd: values.firstDate,
        weeks: values.repeatWeekly ? Number.parseInt(values.weeks, 10) : 1,
        weekdays: values.repeatWeekly
          ? values.weekdays
          : [getDay(parseISO(values.firstDate))],
        startTime: values.startTime,
        endTime: values.endTime,
        capacity: Number.parseInt(values.capacity, 10),
      });
      const added =
        result.created === 1 ? "Added 1 session." : `Added ${result.created} sessions.`;
      const skipped =
        result.skipped > 0
          ? ` Skipped ${result.skipped} that overlapped an existing session or had already ended.`
          : "";
      if (result.created === 0) {
        setFormError(`No sessions added.${skipped}`);
      } else {
        setSuccessMessage(`${added}${skipped}`);
        reset({ ...values });
      }
    } catch (cause) {
      setFormError(errorText(cause, "Could not add sessions."));
    }
  };

  const toggleAccepting = async () => {
    try {
      await setAccepting.mutateAsync(!acceptingBookings);
    } catch (cause) {
      setListMessage(errorText(cause, "Could not update booking availability."));
    }
  };

  const cancel = async (session: ClinicSession) => {
    const times = `${format(parseISO(session.startsAt), "EEE, MMM d")} · ${formatSessionTimes(session)}`;
    const confirmed = await confirmAsync({
      title: session.bookedCount > 0 ? "Cancel this session?" : "Remove this session?",
      message:
        session.bookedCount > 0
          ? `${times}. ${session.bookedCount} booked ${session.bookedCount === 1 ? "patient" : "patients"} will be notified that it's cancelled.`
          : `${times}. Nobody has booked it yet.`,
      confirmText: session.bookedCount > 0 ? "Cancel session" : "Remove session",
      cancelText: "Keep it",
      destructive: true,
    });
    if (!confirmed) {
      return;
    }
    setListMessage(null);
    try {
      const result = await cancelSession.mutateAsync({ sessionId: session.id });
      setListMessage(
        result.removed
          ? "Session removed."
          : `Session cancelled. ${result.cancelledBookings} ${result.cancelledBookings === 1 ? "patient was" : "patients were"} notified.`,
      );
    } catch (cause) {
      setListMessage(errorText(cause, "Could not cancel the session."));
    }
  };

  if (blockingError) {
    return (
      <View className="flex-1 justify-center px-4">
        <SchedulingStatePanel
          message={errorText(blockingError, "Could not load schedule.")}
          onRetry={() => void refetchAll()}
        />
      </View>
    );
  }

  if (initialLoading) {
    return (
      <ScreenLoadingSkeleton>
        <View className="gap-4 px-4">
          <CardSkeleton lines={3} />
          <CardSkeleton lines={5} />
        </View>
      </ScreenLoadingSkeleton>
    );
  }

  return (
    <ScrollView
      contentContainerClassName="gap-4 px-4 pb-8 pt-2"
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl refreshing={userRefreshing} onRefresh={() => void refresh()} />
      }
    >
      {intro ? <Text className="text-sm text-ink-muted">{intro}</Text> : null}
      <RefreshErrorNotice
        message={refreshError ? errorText(refreshError, "Could not refresh schedule.") : null}
      />

      <Card style={{ gap: 12 }}>
        <Text className="text-base font-semibold text-ink">Accepting bookings</Text>
        <Text className="text-sm text-ink-muted">
          When off, sessions stay on the schedule and existing bookings are kept,
          but patients can&apos;t book new places.
        </Text>
        <Pressable
          accessibilityLabel={acceptingBookings ? "Turn off new bookings" : "Turn on new bookings"}
          accessibilityRole="button"
          accessibilityState={{ disabled: setAccepting.isPending, busy: setAccepting.isPending }}
          className={[
            "min-h-12 items-center justify-center rounded-xl px-4 web:hover:opacity-90",
            acceptingBookings ? "bg-available" : "border border-ink-muted bg-surface",
          ].join(" ")}
          disabled={setAccepting.isPending}
          onPress={() => void toggleAccepting()}
        >
          <Text
            className={`text-base font-semibold ${acceptingBookings ? "text-surface" : "text-ink-muted"}`}
          >
            {acceptingBookings ? "Accepting new bookings" : "Not accepting bookings"}
          </Text>
        </Pressable>
      </Card>

      <SessionFormCard
        control={control}
        formError={formError}
        submitting={createSessions.isPending}
        successMessage={successMessage}
        onSubmit={() => void handleSubmit(submit)()}
      />

      <View className="gap-3">
        <Text accessibilityRole="header" className="text-base font-semibold text-ink">
          Upcoming sessions
        </Text>
        {listMessage ? (
          <Text accessibilityLiveRegion="polite" className="text-sm text-primary">
            {listMessage}
          </Text>
        ) : null}
        {sections.length === 0 ? (
          <EmptyState message="No sessions in the next 8 weeks. Add some above." />
        ) : (
          sections.map((section) => (
            <View key={section.dateKey} className="gap-2">
              <Text className="text-sm font-semibold text-ink">{section.title}</Text>
              {section.sessions.map((session) => {
                const cancelled = session.status === "cancelled";
                const ended = parseISO(session.endsAt).getTime() <= Date.now();
                return (
                  <Card key={session.id} style={{ gap: 6, opacity: cancelled || ended ? 0.6 : 1 }}>
                    <View className="flex-row items-start justify-between gap-3">
                      <View className="min-w-0 flex-1 gap-1">
                        <Text className="text-base font-semibold text-ink" selectable>
                          {formatSessionTimes(session)}
                        </Text>
                        <Text className="text-sm text-ink-muted">
                          {cancelled
                            ? "Cancelled"
                            : `${session.bookedCount} of ${session.capacity} booked${ended ? " · ended" : ""}`}
                        </Text>
                      </View>
                      {!cancelled && !ended ? (
                        <Pressable
                          accessibilityLabel={`Cancel session ${formatSessionTimes(session)} on ${section.title}`}
                          accessibilityRole="button"
                          accessibilityState={{
                            disabled: cancellingId === session.id,
                            busy: cancellingId === session.id,
                          }}
                          className="min-h-11 justify-center rounded-lg border border-ink-muted px-3 web:hover:opacity-90"
                          disabled={cancellingId === session.id}
                          onPress={() => void cancel(session)}
                        >
                          <Text className="text-sm font-semibold text-ink-muted">
                            {cancellingId === session.id ? "Cancelling…" : "Cancel"}
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>
                  </Card>
                );
              })}
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}
