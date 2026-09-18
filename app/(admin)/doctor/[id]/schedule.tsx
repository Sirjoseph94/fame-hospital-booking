import { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";

import { DoctorSchedulePanel } from "@/components/doctor/doctor-schedule-panel";
import { SchedulingStatePanel } from "@/components/ui/scheduling-state-panel";
import { ScreenLoadingSkeleton } from "@/components/ui/skeleton";
import {
  SchedulingError,
  schedulingService,
} from "@/lib/services/scheduling";

export default function AdminDoctorScheduleScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const doctorId = id ?? "";

  const [doctorName, setDoctorName] = useState("Doctor");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!doctorId) {
      setError("Missing doctor.");
      setLoading(false);
      return;
    }

    setError(null);
    try {
      const doctors = await schedulingService.listDoctors();
      const doctor = doctors.find((row) => row.id === doctorId);
      setDoctorName(doctor?.name ?? "Doctor");
    } catch (cause) {
      setError(
        cause instanceof SchedulingError
          ? cause.message
          : "Could not load doctor.",
      );
    } finally {
      setLoading(false);
    }
  }, [doctorId]);

  useEffect(() => {
    const task = setTimeout(() => void load(), 0);
    return () => clearTimeout(task);
  }, [load]);

  return (
    <View className="flex-1 bg-surface-muted">
      <View className="flex-row items-center gap-2 px-4 pb-2 pt-2">
        <Pressable
          accessibilityLabel="Back to roster"
          accessibilityRole="button"
          className="h-12 w-12 items-center justify-center rounded-full web:hover:bg-surface"
          onPress={() => router.back()}
        >
          <ChevronLeft color="currentColor" size={24} />
        </Pressable>
        <View className="min-w-0 flex-1">
          <Text className="text-lg font-semibold text-ink">{doctorName}</Text>
          <Text className="text-sm text-ink-muted">Manage schedule</Text>
        </View>
      </View>

      {loading ? (
        <ScreenLoadingSkeleton />
      ) : error ? (
        <View className="flex-1 justify-center px-4">
          <SchedulingStatePanel message={error} onRetry={() => void load()} />
        </View>
      ) : (
        <DoctorSchedulePanel
          doctorId={doctorId}
          intro="Hospital admin: add or remove open slots and control whether this doctor accepts new bookings."
        />
      )}
    </View>
  );
}
