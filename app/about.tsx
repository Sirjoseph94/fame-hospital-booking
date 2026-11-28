import { RefreshControl, Text, View } from "react-native";
import Constants from "expo-constants";
import { Stack } from "expo-router";
import { useState } from "react";

import { PageScrollView } from "@/components/ui/page-scroll-view";
import { HospitalContactCard } from "@/components/hospital/hospital-contact-card";
import { goBack } from "@/components/legal/legal-page";
import { LegalLinks } from "@/components/legal/legal-links";
import { BackButton } from "@/components/ui/back-button";
import { Card } from "@/components/ui/card";
import { DEFAULT_HOSPITAL_INFO } from "@/lib/hospital-info";
import { useHospitalInfo } from "@/lib/queries/hospital-info";
import { useHospitalSettings } from "@/lib/queries/hospital-settings";
import { useSessionStore } from "@/lib/stores/session";

const BASE_STEPS = [
  "Book a place in a doctor's clinic session. Your place is confirmed straight away.",
  "On the day, check in by scanning the code at reception with the app (or ask at the desk).",
  "Patients are seen in order of arrival. The app shows your place in line and tells you when you're next.",
];
const REMINDER_STEP = "We send a reminder the evening before and on the morning of your visit.";
const WAITLIST_STEP = "Session full? Join the waitlist and you'll be booked automatically if a place frees up.";

/** Public: the hospital's details, how booking works, and the legal pages. */
export default function AboutScreen() {
  const infoQuery = useHospitalInfo();
  const info = infoQuery.data ?? DEFAULT_HOSPITAL_INFO;
  const [refreshing, setRefreshing] = useState(false);
  const version = Constants.expoConfig?.version;
  // Settings are for signed-in users; signed out, only promise the basics.
  const signedIn = useSessionStore((state) => Boolean(state.session));
  const { data: settings } = useHospitalSettings({ enabled: signedIn });
  const steps = [
    ...BASE_STEPS,
    ...(settings?.remindersEnabled ? [REMINDER_STEP] : []),
    ...(settings?.waitlistEnabled ? [WAITLIST_STEP] : []),
  ];

  const refresh = async () => {
    setRefreshing(true);
    try {
      await infoQuery.refetch();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: `About · ${info.name}` }} />
      <PageScrollView
        className="flex-1 bg-surface-muted"
        contentContainerClassName="items-center px-4 pb-10 pt-4"
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
      >
        <View className="w-full max-w-2xl gap-4">
          <BackButton label="Back" onPress={goBack} />

          <View className="gap-2">
            <Text accessibilityRole="header" className="text-3xl font-bold text-ink">
              {info.name}
            </Text>
            {info.about ? (
              <Text className="text-base leading-7 text-ink-muted" selectable>
                {info.about}
              </Text>
            ) : null}
          </View>

          <HospitalContactCard info={info} />

          <Card style={{ gap: 10 }}>
            <Text accessibilityRole="header" className="text-base font-semibold text-ink">
              How booking works
            </Text>
            {steps.map((line, index) => (
              <View key={line} className="flex-row gap-3">
                <View className="h-6 w-6 items-center justify-center rounded-full bg-surface-muted">
                  <Text className="text-xs font-semibold text-ink-muted">{index + 1}</Text>
                </View>
                <Text className="min-w-0 flex-1 text-base leading-6 text-ink">{line}</Text>
              </View>
            ))}
          </Card>

          <Card style={{ gap: 4 }}>
            <Text className="text-sm text-ink-muted">
              In an emergency, don&apos;t wait for a clinic session: go to the emergency
              department or call your local emergency number.
            </Text>
          </Card>

          <View className="items-center gap-1 pt-2">
            <LegalLinks />
            {version ? (
              <Text className="text-xs text-ink-muted">App version {version}</Text>
            ) : null}
          </View>
        </View>
      </PageScrollView>
    </>
  );
}
