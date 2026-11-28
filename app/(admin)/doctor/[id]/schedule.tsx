import { View } from "react-native";
import { useLocalSearchParams } from "expo-router";

import { AdminDoctorHeader } from "@/components/admin/admin-doctor-header";
import { DoctorDetailsCard } from "@/components/admin/doctor-details-card";
import { DoctorSchedulePanel } from "@/components/doctor/doctor-schedule-panel";
import { SchedulingStatePanel } from "@/components/ui/scheduling-state-panel";
import { ScreenLoadingSkeleton } from "@/components/ui/skeleton";
import { useDoctor } from "@/lib/queries/doctors";
import { SchedulingError } from "@/lib/services/scheduling";

export default function AdminDoctorScheduleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const doctorId = id ?? "";

  const doctorQuery = useDoctor(doctorId || undefined);
  const doctor = doctorQuery.data ?? null;

  let error: string | null = null;
  if (!doctorId) {
    error = "Missing doctor.";
  } else if (doctorQuery.isError && !doctorQuery.data) {
    error =
      doctorQuery.error instanceof SchedulingError
        ? doctorQuery.error.message
        : "Could not load doctor.";
  }

  return (
    <View className="flex-1 bg-surface-muted">
      <AdminDoctorHeader doctor={doctor} subtitle="Details and schedule" />

      {error ? (
        <View className="flex-1 justify-center px-4">
          <SchedulingStatePanel
            message={error}
            onRetry={() => {
              // A disabled query would still fetch on refetch(); there's no
              // doctor to load without an id.
              if (doctorId) {
                void doctorQuery.refetch();
              }
            }}
          />
        </View>
      ) : doctorQuery.isPending ? (
        <ScreenLoadingSkeleton />
      ) : (
        <DoctorSchedulePanel
          doctorId={doctorId}
          header={doctor ? <DoctorDetailsCard key={doctor.id} doctor={doctor} /> : null}
          intro="Hospital admin: add or cancel this doctor's clinic sessions and control whether they accept new bookings."
        />
      )}
    </View>
  );
}
