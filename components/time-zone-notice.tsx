import { Text, View } from "react-native";

import { useHospitalSettings } from "@/lib/queries/hospital-settings";
import { deviceClockDiffers } from "@/lib/time-zone";

/** Warns when this device's clock zone differs from the hospital's. */
export function TimeZoneNotice() {
  const { data: settings } = useHospitalSettings();
  if (!settings || !deviceClockDiffers(settings.timeZone)) {
    return null;
  }
  return (
    <View className="mx-4 mb-2 rounded-xl bg-warning/10 px-3 py-2">
      <Text className="text-sm text-ink">
        Your device is set to a different time zone from the hospital ({settings.timeZone}). Session
        times are the hospital&apos;s local times; set your device to that zone to see them correctly.
      </Text>
    </View>
  );
}
