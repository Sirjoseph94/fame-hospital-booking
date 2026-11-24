import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";

import { colors } from "@/lib/theme-colors";
import type { DoctorDetail } from "@/types/scheduling";

interface AdminDoctorHeaderProps {
  /** Null while loading or if the doctor couldn't be loaded. */
  doctor: DoctorDetail | null;
  subtitle: string;
}

/** Back button + doctor name for admin screens that act on one doctor. */
export function AdminDoctorHeader({ doctor, subtitle }: AdminDoctorHeaderProps) {
  const router = useRouter();

  return (
    <View className="flex-row items-center gap-2 px-2 py-3">
      <Pressable
        accessibilityLabel="Back to roster"
        accessibilityRole="button"
        className="h-12 w-12 items-center justify-center rounded-full web:hover:bg-surface"
        onPress={() => router.back()}
      >
        <ChevronLeft color={colors.ink} size={24} />
      </Pressable>
      <View className="min-w-0 flex-1">
        <View className="flex-row flex-wrap items-center gap-2">
          <Text className="text-lg font-bold text-ink" numberOfLines={1}>
            {doctor?.name ?? "Doctor"}
          </Text>
          {doctor && !doctor.isActive ? (
            <View
              accessibilityLabel="Doctor account inactive"
              className="rounded-full border border-ink-muted px-2 py-0.5"
            >
              <Text className="text-xs font-semibold text-ink-muted">
                Inactive
              </Text>
            </View>
          ) : null}
        </View>
        <Text className="text-sm text-ink-muted">{subtitle}</Text>
      </View>
    </View>
  );
}
