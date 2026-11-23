import { useCallback, useEffect, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { format } from "date-fns";

import { BlackoutFormCard } from "@/components/blackout/blackout-form-card";
import { ShellHeader } from "@/components/shell-header";
import { BlackoutRuleCard } from "@/components/blackout/blackout-rule-card";
import { EmptyState } from "@/components/ui/empty-state";
import { SchedulingStatePanel } from "@/components/ui/scheduling-state-panel";
import {
  CardSkeleton,
  ScreenLoadingSkeleton,
} from "@/components/ui/skeleton";
import {
  SchedulingError,
  schedulingService,
} from "@/lib/services/scheduling";
import { useSessionStore } from "@/lib/stores/session";
import {
  blackoutFormSchema,
  type BlackoutFormFields,
  toIsoDateTimeFromForm,
} from "@/lib/validation/forms";
import type { BlackoutRule } from "@/types/scheduling";

export default function DoctorBlackoutScreen() {
  const session = useSessionStore((state) => state.session);
  const [blackouts, setBlackouts] = useState<BlackoutRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const { control, handleSubmit, reset } = useForm<BlackoutFormFields>({
    resolver: zodResolver(blackoutFormSchema),
    defaultValues: {
      slotDate: format(new Date(), "yyyy-MM-dd"),
      startTime: "13:00",
      endTime: "16:00",
      reason: "",
    },
  });

  const userId = session?.userId;

  const load = useCallback(async () => {
    if (!userId) {
      return;
    }

    setError(null);
    try {
      const rows = await schedulingService.listBlackouts(userId);
      setBlackouts(rows);
    } catch (cause) {
      setError(
        cause instanceof SchedulingError
          ? cause.message
          : "Could not load blackout hours.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  useEffect(() => {
    const task = setTimeout(() => void load(), 0);
    return () => clearTimeout(task);
  }, [load]);

  const submit = async (values: BlackoutFormFields) => {
    if (!session) {
      return;
    }

    setSubmitting(true);
    setFormError(null);
    setSuccessMessage(null);

    try {
      await schedulingService.setBlackout({
        doctorId: session.userId,
        startsAt: toIsoDateTimeFromForm(values.slotDate, values.startTime),
        endsAt: toIsoDateTimeFromForm(values.slotDate, values.endTime),
        reason: values.reason.trim(),
        setBy: "doctor",
      });
      reset({
        slotDate: values.slotDate,
        startTime: "13:00",
        endTime: "16:00",
        reason: "",
      });
      setSuccessMessage("Blackout saved. Overlapping slots are now unavailable.");
      await load();
    } catch (cause) {
      setFormError(
        cause instanceof SchedulingError
          ? cause.message
          : "Could not save blackout.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View className="flex-1 bg-surface-muted">
      <ShellHeader title="Blackout" />

      {loading ? (
        <ScreenLoadingSkeleton>
          <View className="gap-4 px-4">
            <CardSkeleton lines={5} />
            <CardSkeleton lines={2} />
          </View>
        </ScreenLoadingSkeleton>
      ) : error ? (
        <View className="flex-1 justify-center px-4">
          <SchedulingStatePanel message={error} onRetry={() => void load()} />
        </View>
      ) : (
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
          <BlackoutFormCard
            control={control}
            formError={formError}
            intro="Block a single period when you cannot take appointments. Slots in this window become unavailable for booking."
            submitting={submitting}
            successMessage={successMessage}
            onSubmit={() => void handleSubmit(submit)()}
          />

          <View className="gap-3">
            <Text className="text-base font-semibold text-ink">Your blackouts</Text>
            {blackouts.length === 0 ? (
              <EmptyState message="No doctor blackouts on file." />
            ) : (
              blackouts.map((rule) => (
                <BlackoutRuleCard
                  key={rule.id}
                  rule={rule}
                  setByLabel={
                    rule.setBy === "admin" ? "Set by admin" : "Your blackout"
                  }
                  onDeleted={() => {
                    setSuccessMessage("Blackout removed.");
                    void load();
                  }}
                />
              ))
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
}
