import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useLocalSearchParams, useRouter } from "expo-router";
import { format } from "date-fns";
import { ChevronLeft } from "lucide-react-native";

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

export default function AdminDoctorBlackoutScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const doctorId = id ?? "";

  const [doctorName, setDoctorName] = useState("Doctor");
  const [blackouts, setBlackouts] = useState<BlackoutRule[]>([]);
  const [loading, setLoading] = useState(true);
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

  const load = useCallback(async () => {
    if (!doctorId) {
      setError("Missing doctor.");
      setLoading(false);
      return;
    }

    setError(null);
    try {
      const [doctors, rules] = await Promise.all([
        schedulingService.listDoctors(),
        schedulingService.listBlackouts(doctorId),
      ]);
      const doctor = doctors.find((row) => row.id === doctorId);
      setDoctorName(doctor?.name ?? "Doctor");
      setBlackouts(rules);
    } catch (cause) {
      setError(
        cause instanceof SchedulingError
          ? cause.message
          : "Could not load blackout settings.",
      );
    } finally {
      setLoading(false);
    }
  }, [doctorId]);

  useEffect(() => {
    const task = setTimeout(() => void load(), 0);
    return () => clearTimeout(task);
  }, [load]);

  const title = useMemo(
    () => `Blackout for ${doctorName}`,
    [doctorName],
  );

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
        setBy: "admin",
      });
      reset({
        slotDate: values.slotDate,
        startTime: "13:00",
        endTime: "16:00",
        reason: "",
      });
      setSuccessMessage("Blackout saved on behalf of this doctor.");
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
      <View className="flex-row items-center gap-2 px-2 py-3">
        <Pressable
          accessibilityLabel="Back to roster"
          accessibilityRole="button"
          className="h-12 w-12 items-center justify-center rounded-full web:hover:bg-surface"
          onPress={() => router.back()}
        >
          <ChevronLeft color="currentColor" size={24} />
        </Pressable>
        <View className="min-w-0 flex-1">
          <Text className="text-lg font-bold text-ink">{title}</Text>
          <Text className="text-sm text-ink-muted">Admin · on behalf</Text>
        </View>
      </View>

      {loading ? (
        <ScreenLoadingSkeleton>
          <View className="gap-4 px-4">
            <CardSkeleton lines={5} />
          </View>
        </ScreenLoadingSkeleton>
      ) : error ? (
        <View className="flex-1 justify-center px-4">
          <SchedulingStatePanel message={error} onRetry={() => void load()} />
        </View>
      ) : (
        <ScrollView
          contentContainerClassName="gap-4 px-4 pb-8"
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
        >
          <BlackoutFormCard
            control={control}
            formError={formError}
            intro="One non-repeating unavailable window. Overlapping slots become unavailable for booking."
            submitLabel="Save blackout on behalf"
            submitting={submitting}
            successMessage={successMessage}
            onSubmit={() => void handleSubmit(submit)()}
          />

          <View className="gap-3">
            <Text className="text-base font-semibold text-ink">Scheduled blackouts</Text>
            {blackouts.length === 0 ? (
              <EmptyState message="No blackouts for this doctor." />
            ) : (
              blackouts.map((rule) => (
                <BlackoutRuleCard
                  key={rule.id}
                  rule={rule}
                  setByLabel={
                    rule.setBy === "admin" ? "Set by admin" : "Set by doctor"
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
