import { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { format } from "date-fns";

import { BlackoutFormCard } from "@/components/blackout/blackout-form-card";
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
import {
  blackoutFormSchema,
  type BlackoutFormFields,
  toIsoDateTimeFromForm,
} from "@/lib/validation/forms";
import type { BlackoutRule } from "@/types/scheduling";

export interface BlackoutManagerCopy {
  intro: string;
  submitLabel?: string;
  savedMessage: string;
  listTitle: string;
  emptyMessage: string;
  /** Label for a rule set by the other party (doctor vs admin). */
  otherPartyLabel: string;
  /** Label for a rule set by the current actor. */
  ownLabel: string;
}

interface BlackoutManagerProps {
  /** Doctor whose blackouts are managed. Nothing loads until it's set. */
  doctorId: string | undefined;
  /** Who is acting: the doctor themselves or an admin on their behalf. */
  setBy: BlackoutRule["setBy"];
  copy: BlackoutManagerCopy;
}

const DEFAULT_WINDOW = { startTime: "13:00", endTime: "16:00" };

/** Create/list/remove one-off blackout windows for a doctor. */
export function BlackoutManager({ doctorId, setBy, copy }: BlackoutManagerProps) {
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
      ...DEFAULT_WINDOW,
      reason: "",
    },
  });

  const load = useCallback(async () => {
    if (!doctorId) {
      return;
    }

    setError(null);
    try {
      setBlackouts(await schedulingService.listBlackouts(doctorId));
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
  }, [doctorId]);

  useEffect(() => {
    const task = setTimeout(() => void load(), 0);
    return () => clearTimeout(task);
  }, [load]);

  const submit = async (values: BlackoutFormFields) => {
    if (!doctorId) {
      return;
    }

    setSubmitting(true);
    setFormError(null);
    setSuccessMessage(null);

    try {
      await schedulingService.setBlackout({
        doctorId,
        startsAt: toIsoDateTimeFromForm(values.slotDate, values.startTime),
        endsAt: toIsoDateTimeFromForm(values.slotDate, values.endTime),
        reason: values.reason.trim(),
        setBy,
      });
      reset({ slotDate: values.slotDate, ...DEFAULT_WINDOW, reason: "" });
      setSuccessMessage(copy.savedMessage);
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

  if (loading) {
    return (
      <ScreenLoadingSkeleton>
        <View className="gap-4 px-4">
          <CardSkeleton lines={5} />
          <CardSkeleton lines={2} />
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
      <BlackoutFormCard
        control={control}
        formError={formError}
        intro={copy.intro}
        submitLabel={copy.submitLabel}
        submitting={submitting}
        successMessage={successMessage}
        onSubmit={() => void handleSubmit(submit)()}
      />

      <View className="gap-3">
        <Text className="text-base font-semibold text-ink">{copy.listTitle}</Text>
        {blackouts.length === 0 ? (
          <EmptyState message={copy.emptyMessage} />
        ) : (
          blackouts.map((rule) => (
            <BlackoutRuleCard
              key={rule.id}
              rule={rule}
              setByLabel={rule.setBy === setBy ? copy.ownLabel : copy.otherPartyLabel}
              onDeleted={() => {
                setSuccessMessage("Blackout removed.");
                void load();
              }}
            />
          ))
        )}
      </View>
    </ScrollView>
  );
}
