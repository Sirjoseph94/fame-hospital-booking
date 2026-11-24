import { useState } from "react";
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
import { RefreshErrorNotice } from "@/components/ui/refresh-error-notice";
import { useBlackouts, useSetBlackout } from "@/lib/queries/blackouts";
import { SchedulingError } from "@/lib/services/scheduling";
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

function loadErrorMessage(cause: unknown): string {
  return cause instanceof SchedulingError
    ? cause.message
    : "Could not load blackout hours.";
}

/** Create/list/remove one-off blackout windows for a doctor. */
export function BlackoutManager({ doctorId, setBy, copy }: BlackoutManagerProps) {
  const [userRefreshing, setUserRefreshing] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const blackoutsQuery = useBlackouts(doctorId);
  const setBlackout = useSetBlackout();
  const blackouts = blackoutsQuery.data;
  const submitting = setBlackout.isPending;

  const { control, handleSubmit, reset } = useForm<BlackoutFormFields>({
    resolver: zodResolver(blackoutFormSchema),
    defaultValues: {
      slotDate: format(new Date(), "yyyy-MM-dd"),
      ...DEFAULT_WINDOW,
      reason: "",
    },
  });

  const refresh = async () => {
    setUserRefreshing(true);
    try {
      await blackoutsQuery.refetch();
    } finally {
      setUserRefreshing(false);
    }
  };

  const submit = async (values: BlackoutFormFields) => {
    if (!doctorId) {
      return;
    }

    setFormError(null);
    setSuccessMessage(null);

    try {
      await setBlackout.mutateAsync({
        doctorId,
        startsAt: toIsoDateTimeFromForm(values.slotDate, values.startTime),
        endsAt: toIsoDateTimeFromForm(values.slotDate, values.endTime),
        reason: values.reason.trim(),
        setBy,
      });
      reset({ slotDate: values.slotDate, ...DEFAULT_WINDOW, reason: "" });
      setSuccessMessage(copy.savedMessage);
    } catch (cause) {
      setFormError(
        cause instanceof SchedulingError
          ? cause.message
          : "Could not save blackout.",
      );
    }
  };

  if (blackoutsQuery.error && !blackouts) {
    return (
      <View className="flex-1 justify-center px-4">
        <SchedulingStatePanel
          message={loadErrorMessage(blackoutsQuery.error)}
          onRetry={() => void blackoutsQuery.refetch()}
        />
      </View>
    );
  }

  if (!blackouts) {
    return (
      <ScreenLoadingSkeleton>
        <View className="gap-4 px-4">
          <CardSkeleton lines={5} />
          <CardSkeleton lines={2} />
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
        <RefreshControl
          refreshing={userRefreshing}
          onRefresh={() => void refresh()}
        />
      }
    >
      <RefreshErrorNotice
        message={blackoutsQuery.error ? loadErrorMessage(blackoutsQuery.error) : null}
      />

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
              onDeleted={() => setSuccessMessage("Blackout removed.")}
            />
          ))
        )}
      </View>
    </ScrollView>
  );
}
