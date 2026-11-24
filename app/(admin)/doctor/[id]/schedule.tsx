import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { useLocalSearchParams } from "expo-router";

import { AdminDoctorHeader } from "@/components/admin/admin-doctor-header";
import { DoctorSchedulePanel } from "@/components/doctor/doctor-schedule-panel";
import { SchedulingStatePanel } from "@/components/ui/scheduling-state-panel";
import { ScreenLoadingSkeleton } from "@/components/ui/skeleton";
import {
  SchedulingError,
  schedulingService,
} from "@/lib/services/scheduling";
import type { DoctorDetail } from "@/types/scheduling";

export default function AdminDoctorScheduleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const doctorId = id ?? "";

  const [doctor, setDoctor] = useState<DoctorDetail | null>(null);
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
      setDoctor(await schedulingService.getDoctor(doctorId));
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
      <AdminDoctorHeader doctor={doctor} subtitle="Manage schedule" />

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
