import { View } from "react-native";

import { BlackoutManager } from "@/components/blackout/blackout-manager";
import { ShellHeader } from "@/components/shell-header";
import { useSessionStore } from "@/lib/stores/session";

export default function DoctorBlackoutScreen() {
  const userId = useSessionStore((state) => state.session?.userId);

  return (
    <View className="flex-1 bg-surface-muted">
      <ShellHeader title="Blackout" />
      <BlackoutManager
        doctorId={userId}
        setBy="doctor"
        copy={{
          intro:
            "Block a single period when you cannot take appointments. Slots in this window become unavailable for booking.",
          savedMessage: "Blackout saved. Overlapping slots are now unavailable.",
          listTitle: "Your blackouts",
          emptyMessage: "No doctor blackouts on file.",
          ownLabel: "Your blackout",
          otherPartyLabel: "Set by admin",
        }}
      />
    </View>
  );
}
