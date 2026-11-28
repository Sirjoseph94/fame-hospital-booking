import { useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";

import { CheckInPosterCard } from "@/components/admin/check-in-poster-card";
import { HospitalInfoForm } from "@/components/admin/hospital-info-form";
import { PlatformSettingsCard } from "@/components/admin/platform-settings-card";
import { TimeZoneCard } from "@/components/admin/time-zone-card";
import { ShellHeader } from "@/components/shell-header";
import { useAdminBack } from "@/lib/hooks/use-admin-back";
import { useBreakpoint } from "@/lib/platform";
import { queryKeys } from "@/lib/query/keys";

/** Admin: hospital details, time zone, booking rules and the check-in poster. */
export default function AdminSettingsScreen() {
  const queryClient = useQueryClient();
  const onBack = useAdminBack();
  const isWide = useBreakpoint() === "desktop";
  const [refreshing, setRefreshing] = useState(false);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        queryClient.refetchQueries({ queryKey: queryKeys.hospitalInfo }),
        queryClient.refetchQueries({ queryKey: queryKeys.hospitalSettings }),
        queryClient.refetchQueries({ queryKey: queryKeys.checkInCode }),
      ]);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <View className="flex-1 bg-surface-muted">
      <ShellHeader onBack={onBack} title="Settings" />
      <ScrollView
        contentContainerClassName="gap-4 px-4 pb-8 pt-2"
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
      >
        <View className={isWide ? "flex-row items-start gap-4" : "gap-4"}>
          <View className={isWide ? "min-w-0 flex-1 gap-4" : "gap-4"}>
            <HospitalInfoForm />
          </View>
          <View className={isWide ? "min-w-0 flex-1 gap-4" : "gap-4"}>
            <PlatformSettingsCard />
            <TimeZoneCard />
            <CheckInPosterCard />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
