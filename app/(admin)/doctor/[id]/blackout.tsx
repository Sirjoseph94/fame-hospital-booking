import { useEffect, useState } from "react";
import { View } from "react-native";
import { useLocalSearchParams } from "expo-router";

import { AdminDoctorHeader } from "@/components/admin/admin-doctor-header";
import { BlackoutManager } from "@/components/blackout/blackout-manager";
import { SchedulingStatePanel } from "@/components/ui/scheduling-state-panel";
import { schedulingService } from "@/lib/services/scheduling";
import type { DoctorDetail } from "@/types/scheduling";

export default function AdminDoctorBlackoutScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [doctor, setDoctor] = useState<DoctorDetail | null>(null);

  // Header only; the blackout list loads (and reports errors) independently.
  useEffect(() => {
    if (!id) {
      return;
    }
    let cancelled = false;
    schedulingService
      .getDoctor(id)
      .then((detail) => {
        if (!cancelled) {
          setDoctor(detail);
        }
      })
      .catch(() => {
        // Header falls back to "Doctor".
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

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
