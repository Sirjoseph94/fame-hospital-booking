import { useMemo, useState } from "react";
import { FlatList, Pressable, ScrollView, Text, View } from "react-native";
import { Stack, router } from "expo-router";
import { Search, X, Zap } from "lucide-react-native";

import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { FormTextInput } from "@/components/ui/form-text-input";
import { RefreshErrorNotice } from "@/components/ui/refresh-error-notice";
import { SchedulingStatePanel } from "@/components/ui/scheduling-state-panel";
import { ScreenLoadingSkeleton, VisitListSkeleton } from "@/components/ui/skeleton";
import { doctorFilterOptions, firstAvailableDoctor, searchDoctors } from "@/lib/doctor-search";
import { useDoctors } from "@/lib/queries/doctors";
import { useHospitalSettings } from "@/lib/queries/hospital-settings";
import { formatSessionWhen, placesLeftLabel } from "@/lib/session-groups";
import { useBookingStore } from "@/lib/stores/booking";
import { useSessionStore } from "@/lib/stores/session";
import { SchedulingError } from "@/lib/services/scheduling";
import { colors } from "@/lib/theme-colors";
import type { Doctor } from "@/types/scheduling";

function doctorsErrorMessage(cause: unknown): string {
  return cause instanceof SchedulingError ? cause.message : "Could not load doctors.";
}

export default function BookDoctorScreen() {
  const session = useSessionStore((state) => state.session);
  const setDoctor = useBookingStore((state) => state.setDoctor);
  const setSession = useBookingStore((state) => state.setSession);
  const skipIntake = useBookingStore((state) => state.skipIntake);
  const doctorsQuery = useDoctors();
  const waitlistEnabled = useHospitalSettings().data?.waitlistEnabled ?? false;
  const doctorRows = doctorsQuery.data;
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<string | null>(null);

  const accepting = useMemo(
    () => (doctorRows ?? []).filter((doctor) => doctor.isAcceptingBookings),
    [doctorRows],
  );
  const options = useMemo(() => doctorFilterOptions(accepting), [accepting]);
  const doctors = useMemo(() => searchDoctors(accepting, query, filter), [accepting, filter, query]);
  const firstAvailable = useMemo(() => firstAvailableDoctor(accepting), [accepting]);
  const searching = query.trim().length > 0 || filter !== null;

  const initialLoading = doctorRows === undefined && doctorsQuery.isPending;
  const blockingError = doctorsQuery.isError && doctorRows === undefined ? doctorsQuery.error : null;
  const refreshError = doctorsQuery.isError ? doctorsQuery.error : null;

  if (!session) {
    return null;
  }

  const pickDoctor = (doctor: Doctor) => {
    setDoctor(doctor.id, doctor.name);
    router.push("/book/session");
  };

  /** Straight to the earliest open place (the session is re-checked on booking). */
  const bookFirstAvailable = (doctor: Doctor) => {
    if (!doctor.nextSession) return;
    setDoctor(doctor.id, doctor.name);
    setSession({
      id: doctor.nextSession.sessionId,
      startsAt: doctor.nextSession.startsAt,
      endsAt: doctor.nextSession.endsAt,
    });
    router.push(skipIntake ? "/book/confirmation" : "/book/intake");
  };

  const header = (
    <View className="gap-3 pb-1">
      {refreshError ? <RefreshErrorNotice message={doctorsErrorMessage(refreshError)} /> : null}
      {firstAvailable?.nextSession && !searching ? (
        <Pressable
          accessibilityHint="Books the earliest place with any doctor"
          accessibilityLabel={`First available: ${firstAvailable.name}, ${formatSessionWhen(firstAvailable.nextSession)}`}
          accessibilityRole="button"
          className="active:opacity-90"
          onPress={() => bookFirstAvailable(firstAvailable)}
        >
          <Card style={{ gap: 6, borderWidth: 1, borderColor: colors.primary }}>
            <View className="flex-row items-center gap-2">
              <Zap color={colors.primary} size={18} />
              <Text className="text-sm font-semibold uppercase text-primary">First available</Text>
            </View>
            <Text className="text-base font-semibold text-ink">{firstAvailable.name}</Text>
            <Text className="text-sm text-ink-muted">
              {formatSessionWhen(firstAvailable.nextSession)} · {placesLeftLabel(firstAvailable.nextSession.placesLeft)}
            </Text>
          </Card>
        </Pressable>
      ) : null}
      <View className="flex-row items-center gap-2">
        <View className="min-w-0 flex-1 justify-center">
          <FormTextInput
            accessibilityLabel="Search doctors by name, specialty or department"
            autoCapitalize="none"
            autoCorrect={false}
            className="pl-11"
            clearButtonMode="while-editing"
            onChangeText={setQuery}
            placeholder="Search name, specialty or department"
            returnKeyType="search"
            value={query}
          />
          <View pointerEvents="none" className="absolute left-4">
            <Search color={colors["ink-muted"]} size={18} />
          </View>
        </View>
        {query ? (
          <Pressable
            accessibilityLabel="Clear search"
            accessibilityRole="button"
            className="h-12 w-12 items-center justify-center rounded-full web:hover:bg-surface"
            onPress={() => setQuery("")}
          >
            <X color={colors.ink} size={20} />
          </Pressable>
        ) : null}
      </View>
      {options.length > 1 ? (
        <ScrollView
          horizontal
          accessibilityLabel="Filter by specialty or department"
          contentContainerClassName="gap-2"
          keyboardShouldPersistTaps="handled"
          showsHorizontalScrollIndicator={false}
        >
          {[null, ...options].map((option) => {
            const selected = filter === option;
            return (
              <Pressable
                key={option ?? "all"}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                className={[
                  "min-h-11 justify-center rounded-full border px-4",
                  selected ? "border-primary bg-primary" : "border-ink-muted bg-surface",
                ].join(" ")}
                onPress={() => setFilter(option)}
              >
                <Text className={`text-sm ${selected ? "font-semibold text-surface" : "text-ink"}`}>
                  {option ?? "All"}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
      {searching ? (
        <Text accessibilityLiveRegion="polite" className="text-sm text-ink-muted">
          {doctors.length} {doctors.length === 1 ? "doctor" : "doctors"} found
        </Text>
      ) : null}
    </View>
  );

  return (
    <>
      <Stack.Screen options={{ title: "Choose a doctor" }} />
      {initialLoading ? (
        <ScreenLoadingSkeleton>
          <VisitListSkeleton count={4} />
        </ScreenLoadingSkeleton>
      ) : blockingError ? (
        <View className="flex-1 justify-center bg-surface-muted px-4">
          <SchedulingStatePanel message={doctorsErrorMessage(blockingError)} onRetry={() => void doctorsQuery.refetch()} />
        </View>
      ) : (
        <FlatList
          className="bg-surface-muted"
          contentContainerClassName="gap-3 px-4 py-4"
          contentInsetAdjustmentBehavior="automatic"
          data={doctors}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          keyExtractor={(item) => item.id}
          ListHeaderComponent={header}
          ListEmptyComponent={
            <EmptyState
              message={
                searching
                  ? "No doctors match. Try another name or clear the filter."
                  : "No doctors are accepting bookings right now."
              }
            />
          }
          renderItem={({ item }) => (
            <Pressable
              accessibilityLabel={`Book with ${item.name}, ${item.specialty}`}
              accessibilityRole="button"
              className="active:opacity-90"
              onPress={() => pickDoctor(item)}
            >
              <Card style={{ gap: 6 }}>
                <Text className="text-lg font-semibold text-ink">{item.name}</Text>
                <Text className="text-sm text-ink-muted">
                  {item.specialty} · {item.department}
                  {item.yearsExperience
                    ? ` · ${item.yearsExperience} ${item.yearsExperience === 1 ? "year" : "years"}' experience`
                    : ""}
                </Text>
                {item.bio ? (
                  <Text className="text-sm text-ink" numberOfLines={3}>
                    {item.bio}
                  </Text>
                ) : null}
                {item.nextSession ? (
                  <Text className="text-sm text-available">
                    Next session {formatSessionWhen(item.nextSession)} · {placesLeftLabel(item.nextSession.placesLeft)}
                  </Text>
                ) : (
                  <Text className="text-sm text-ink-muted">{waitlistEnabled ? "No places open right now (full sessions have a waitlist)" : "No places open right now"}</Text>
                )}
              </Card>
            </Pressable>
          )}
        />
      )}
    </>
  );
}
