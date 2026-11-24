import { View } from "react-native";
import { useLocalSearchParams } from "expo-router";

import { AdminDoctorHeader } from "@/components/admin/admin-doctor-header";
import { BlackoutManager } from "@/components/blackout/blackout-manager";
import { SchedulingStatePanel } from "@/components/ui/scheduling-state-panel";
import { useDoctor } from "@/lib/queries/doctors";

export default function AdminDoctorBlackoutScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  // Header only; the blackout list loads (and reports errors) independently.
  // While loading or if it fails, the header falls back to "Doctor".
  const doctorQuery = useDoctor(id || undefined);
  const doctor = doctorQuery.data ?? null;

  return (
    <View className="flex-1 bg-surface-muted">
      <AdminDoctorHeader doctor={doctor} subtitle="Blackout · admin, on behalf" />
      {id ? (
        <BlackoutManager
          doctorId={id}
          setBy="admin"
          copy={{
            intro:
              "One non-repeating unavailable window. Overlapping slots become unavailable for booking.",
            submitLabel: "Save blackout on behalf",
            savedMessage: "Blackout saved on behalf of this doctor.",
            listTitle: "Scheduled blackouts",
            emptyMessage: "No blackouts for this doctor.",
            ownLabel: "Set by admin",
            otherPartyLabel: "Set by doctor",
          }}
        />
      ) : (
        <View className="flex-1 justify-center px-4">
          <SchedulingStatePanel message="Missing doctor." />
        </View>
      )}
    </View>
  );
}
