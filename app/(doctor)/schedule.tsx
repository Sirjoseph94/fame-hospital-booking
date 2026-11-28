import { View } from "react-native";

import { DoctorSchedulePanel } from "@/components/doctor/doctor-schedule-panel";
import { ShellHeader } from "@/components/shell-header";
import { useSessionStore } from "@/lib/stores/session";

export default function DoctorScheduleScreen() {
  const session = useSessionStore((state) => state.session);

  if (!session) {
    return null;
  }

  return (
    <View className="flex-1 bg-surface-muted">
      <ShellHeader title="Schedule" />
      <DoctorSchedulePanel
        doctorId={session.userId}
        intro="Set up your clinic sessions and choose whether patients can book you."
      />
    </View>
  );
}
