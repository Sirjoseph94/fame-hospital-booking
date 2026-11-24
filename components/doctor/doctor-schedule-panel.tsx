import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import {
  addDays,
  addMinutes,
  format,
  isBefore,
  parseISO,
  startOfDay,
  subDays,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react-native";

import { AvailabilitySlotFormCard } from "@/components/doctor/availability-slot-form-card";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SchedulingStatePanel } from "@/components/ui/scheduling-state-panel";
import {
  CardSkeleton,
  ScreenLoadingSkeleton,
} from "@/components/ui/skeleton";
import { formatAgendaDayLabel } from "@/lib/doctor-agenda-helpers";
import { scheduleMinimumDate } from "@/lib/scheduling-dates";
import { formatSchedulingTimeRange } from "@/lib/format-scheduling-time";
import {
  SchedulingError,
  schedulingService,
} from "@/lib/services/scheduling";
import {
  availabilitySlotFormSchema,
  type AvailabilitySlotFormFields,
} from "@/lib/validation/forms";
import { colors } from "@/lib/theme-colors";
import type { Slot, SlotStatus } from "@/types/scheduling";

interface DoctorSchedulePanelProps {
  doctorId: string;
  intro?: string;
}

function slotStatusLabel(status: SlotStatus): string {
  if (status === "available") {
    return "Open";
  }
  if (status === "booked") {
    return "Booked";
  }
  if (status === "held") {
    return "Held";
  }
  return "Blocked";
}

function slotEndIso(slot: Slot): string {
  return addMinutes(parseISO(slot.startsAt), slot.durationMin).toISOString();
}

export function DoctorSchedulePanel({
  doctorId,
  intro,
}: DoctorSchedulePanelProps) {
  const [selectedDay, setSelectedDay] = useState(() => startOfDay(new Date()));
  const [slots, setSlots] = useState<Slot[]>([]);
  const [acceptingBookings, setAcceptingBookings] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [toggleBusy, setToggleBusy] = useState(false);
  const [removingSlotId, setRemovingSlotId] = useState<string | null>(null);

  const dayYmd = format(selectedDay, "yyyy-MM-dd");
  const earliestDay = scheduleMinimumDate();
  const canGoToPreviousDay = isBefore(earliestDay, startOfDay(selectedDay));

  const { control, handleSubmit, reset } = useForm<AvailabilitySlotFormFields>({
    resolver: zodResolver(availabilitySlotFormSchema),
    defaultValues: {
      slotDate: dayYmd,
      startTime: "09:00",
      endTime: "09:30",
    },
  });

  useEffect(() => {
    reset((values) => ({ ...values, slotDate: dayYmd }));
  }, [dayYmd, reset]);

  // Monotonic request id: responses for a day the user has already navigated
  // away from are ignored, so a slow earlier request can't overwrite the
  // current day's slots.
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    if (!doctorId) {
      return;
    }

    const requestId = ++requestIdRef.current;
    const isStale = () => requestId !== requestIdRef.current;

    setError(null);
    try {
      const [slotRows, doctor] = await Promise.all([
        schedulingService.listScheduleSlotsOnDate(doctorId, dayYmd),
        schedulingService.getDoctor(doctorId),
      ]);
      if (isStale()) {
        return;
      }
      setSlots(slotRows);
      setAcceptingBookings(doctor.acceptingBookingsFlag);
    } catch (cause) {
      if (isStale()) {
        return;
      }
      setError(
        cause instanceof SchedulingError
          ? cause.message
          : "Could not load schedule.",
      );
    } finally {
      if (!isStale()) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [dayYmd, doctorId]);

  useEffect(() => {
    const task = setTimeout(() => void load(), 0);
    return () => clearTimeout(task);
  }, [load]);

  const shiftDay = (delta: number) => {
    setSelectedDay((current) => {
      const next = delta < 0 ? subDays(current, 1) : addDays(current, 1);
      if (isBefore(startOfDay(next), earliestDay)) {
        return earliestDay;
      }
      return startOfDay(next);
    });
  };

  const submitSlot = async (values: AvailabilitySlotFormFields) => {
    setSubmitting(true);
    setFormError(null);
    setSuccessMessage(null);
    try {
      await schedulingService.createAvailabilitySlot({
        doctorId,
        slotDate: values.slotDate,
        startTime: values.startTime,
        endTime: values.endTime,
      });
      setSuccessMessage("Open slot added.");
      reset({
        slotDate: values.slotDate,
        startTime: "09:00",
        endTime: "09:30",
      });
      await load();
    } catch (cause) {
      setFormError(
        cause instanceof SchedulingError
          ? cause.message
          : "Could not add slot.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const toggleAccepting = async () => {
    setToggleBusy(true);
    try {
      const next = !acceptingBookings;
      const doctor = await schedulingService.setDoctorAcceptingBookings(
        doctorId,
        next,
      );
      setAcceptingBookings(doctor.acceptingBookingsFlag);
    } catch (cause) {
      setFormError(
        cause instanceof SchedulingError
          ? cause.message
          : "Could not update booking availability.",
      );
    } finally {
      setToggleBusy(false);
    }
  };

  const removeSlot = async (slotId: string) => {
    setRemovingSlotId(slotId);
    setFormError(null);
    try {
      await schedulingService.removeAvailabilitySlot(slotId);
      setSuccessMessage("Slot removed.");
      await load();
    } catch (cause) {
      setFormError(
        cause instanceof SchedulingError
          ? cause.message
          : "Could not remove slot.",
      );
    } finally {
      setRemovingSlotId(null);
    }
  };

  const sortedSlots = useMemo(
    () =>
      [...slots].sort(
        (left, right) =>
          parseISO(left.startsAt).getTime() - parseISO(right.startsAt).getTime(),
      ),
    [slots],
  );

  if (loading) {
    return (
      <ScreenLoadingSkeleton>
        <View className="gap-4 px-4">
          <CardSkeleton lines={3} />
          <CardSkeleton lines={5} />
        </View>
      </ScreenLoadingSkeleton>
    );
  }

  if (error) {
    return (
      <View className="flex-1 justify-center px-4">
        <SchedulingStatePanel message={error} onRetry={() => void load()} />
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerClassName="gap-4 px-4 pb-8 pt-2"
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void load();
          }}
        />
      }
    >
      {intro ? (
        <Text className="text-sm text-ink-muted">{intro}</Text>
      ) : null}

      <Card style={{ gap: 12 }}>
        <Text className="text-base font-semibold text-ink">Accepting bookings</Text>
        <Text className="text-sm text-ink-muted">
          When off, your open slots stay on the calendar but patients cannot book
          new visits with you.
        </Text>
        <Pressable
          accessibilityLabel={
            acceptingBookings
              ? "Turn off new bookings"
              : "Turn on new bookings"
          }
          accessibilityRole="button"
          accessibilityState={{ disabled: toggleBusy, busy: toggleBusy }}
          className={[
            "min-h-12 items-center justify-center rounded-xl px-4 web:hover:opacity-90",
            acceptingBookings ? "bg-available" : "border border-ink-muted bg-surface",
          ].join(" ")}
          disabled={toggleBusy}
          onPress={() => void toggleAccepting()}
        >
          <Text
            className={[
              "text-base font-semibold",
              acceptingBookings ? "text-surface" : "text-ink-muted",
            ].join(" ")}
          >
            {acceptingBookings ? "Accepting new bookings" : "Not accepting bookings"}
          </Text>
        </Pressable>
      </Card>

      <View className="flex-row items-center justify-between">
        <Pressable
          accessibilityLabel="Previous day"
          accessibilityRole="button"
          accessibilityState={{ disabled: !canGoToPreviousDay }}
          className={[
            "h-12 w-12 items-center justify-center rounded-full web:hover:bg-surface",
            !canGoToPreviousDay ? "opacity-30" : "",
          ].join(" ")}
          disabled={!canGoToPreviousDay}
          onPress={() => shiftDay(-1)}
        >
          <ChevronLeft color={colors.ink} size={24} />
        </Pressable>
        <View className="items-center">
          <Text className="text-base font-semibold text-ink">
            {formatAgendaDayLabel(selectedDay)}
          </Text>
          <Text className="text-sm text-ink-muted" selectable>
            {dayYmd}
          </Text>
        </View>
        <Pressable
          accessibilityLabel="Next day"
          accessibilityRole="button"
          className="h-12 w-12 items-center justify-center rounded-full web:hover:bg-surface"
          onPress={() => shiftDay(1)}
        >
          <ChevronRight color={colors.ink} size={24} />
        </Pressable>
      </View>

      <AvailabilitySlotFormCard
        control={control}
        formError={formError}
        submitting={submitting}
        successMessage={successMessage}
        onSubmit={() => void handleSubmit(submitSlot)()}
      />

      <View className="gap-3">
        <Text className="text-base font-semibold text-ink">Slots this day</Text>
        {sortedSlots.length === 0 ? (
          <EmptyState message="No slots on this day. Add an open window above." />
        ) : (
          sortedSlots.map((slot) => {
            const range = formatSchedulingTimeRange(
              slot.startsAt,
              slotEndIso(slot),
            );
            const canRemove =
              slot.status === "available" || slot.status === "blackout";
            return (
              <Card key={slot.id} style={{ gap: 8 }}>
                <View className="flex-row items-start justify-between gap-3">
                  <View className="min-w-0 flex-1 gap-1">
                    <Text className="text-base font-semibold text-ink" selectable>
                      {range}
                    </Text>
                    <Text className="text-sm text-ink-muted">
                      {slot.durationMin} min · {slotStatusLabel(slot.status)}
                    </Text>
                  </View>
                  {canRemove ? (
                    <Pressable
                      accessibilityLabel={`Remove slot ${range}`}
                      accessibilityRole="button"
                      accessibilityState={{
                        disabled: removingSlotId === slot.id,
                        busy: removingSlotId === slot.id,
                      }}
                      className="min-h-11 justify-center rounded-lg border border-ink-muted px-3 web:hover:opacity-90"
                      disabled={removingSlotId === slot.id}
                      onPress={() => void removeSlot(slot.id)}
                    >
                      <Text className="text-sm font-semibold text-ink-muted">
                        {removingSlotId === slot.id ? "Removing…" : "Remove"}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              </Card>
            );
          })
        )}
      </View>
    </ScrollView>
  );
}
