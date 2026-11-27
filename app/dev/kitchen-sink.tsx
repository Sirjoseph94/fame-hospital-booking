import { useState } from "react";
import {
  AccessibilityInfo,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { Stack } from "expo-router";
import { addDays, format, setHours, setMinutes } from "date-fns";

import { BeneficiaryPill } from "@/components/ui/beneficiary-pill";
import { Card } from "@/components/ui/card";
import { Sheet } from "@/components/ui/sheet";
import { SessionOption } from "@/components/ui/session-option";
import { VisitCard } from "@/components/ui/visit-card";
import { isWeb } from "@/lib/platform";
import {
  SchedulingError,
  schedulingService,
} from "@/lib/services/scheduling";
import type { ClinicSession } from "@/types/scheduling";

function demoTime(hour: number, minute = 0): string {
  return setMinutes(setHours(addDays(new Date(), 1), hour), minute).toISOString();
}

function demoSession(id: string, startHour: number, endHour: number, booked: number, capacity: number): ClinicSession {
  return {
    id,
    doctorId: "demo",
    dateYmd: format(addDays(new Date(), 1), "yyyy-MM-dd"),
    startsAt: demoTime(startHour),
    endsAt: demoTime(endHour),
    capacity,
    bookedCount: booked,
    placesLeft: Math.max(capacity - booked, 0),
    status: "scheduled",
    isBookable: booked < capacity,
  };
}

const demoSessions = [
  demoSession("plenty", 9, 13, 4, 20),
  demoSession("few", 14, 17, 18, 20),
  demoSession("full", 17, 19, 10, 10),
];

export default function KitchenSinkScreen() {
  const [selectedSession, setSelectedSession] = useState("plenty");
  const [selectedBeneficiary, setSelectedBeneficiary] = useState("self");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [failureMessage, setFailureMessage] = useState<string | null>(null);

  const injectFailure = (code: "SESSION_UNAVAILABLE" | "NETWORK_ERROR") => {
    schedulingService.injectNextFailure(code);
    setFailureMessage(`Next scheduling call will throw ${code}.`);
    AccessibilityInfo.announceForAccessibility(
      `Failure injection armed for ${code}.`,
    );
  };

  const probeFailure = async () => {
    setFailureMessage(null);
    try {
      await schedulingService.listDoctors();
      setFailureMessage("listDoctors succeeded.");
    } catch (error) {
      const message =
        error instanceof SchedulingError
          ? `${error.code}: ${error.message}`
          : error instanceof Error
            ? error.message
            : "Unknown error";
      setFailureMessage(message);
      AccessibilityInfo.announceForAccessibility(message);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: "Kitchen sink" }} />
      <ScrollView
        className="flex-1 bg-surface-muted"
        contentContainerClassName="gap-6 px-4 py-6"
        contentInsetAdjustmentBehavior="automatic"
      >
        <View className="gap-1">
          <Text className="text-2xl font-bold text-ink">UI primitives</Text>
          <Text className="text-base text-ink-muted">
            Step 2 component states for {isWeb ? "web" : "native"} review.
          </Text>
        </View>

        <Card style={{ gap: 12 }}>
          <Text className="text-lg font-semibold text-ink">BeneficiaryPill</Text>
          <View className="flex-row flex-wrap gap-2">
            <BeneficiaryPill
              displayName="Alex Morgan"
              relationship="self"
              selected={selectedBeneficiary === "self"}
              onPress={() => setSelectedBeneficiary("self")}
            />
            <BeneficiaryPill
              displayName="Jordan Morgan"
              relationship="child"
              selected={selectedBeneficiary === "child"}
              onPress={() => setSelectedBeneficiary("child")}
            />
          </View>
        </Card>

        <Card style={{ gap: 12 }}>
          <Text className="text-lg font-semibold text-ink">SessionOption</Text>
          <View accessibilityRole="radiogroup" className="gap-2">
            {demoSessions.map((session) => (
              <SessionOption
                key={session.id}
                disabled={!session.isBookable}
                selected={selectedSession === session.id}
                session={session}
                onPress={() => setSelectedSession(session.id)}
              />
            ))}
          </View>
        </Card>

        <Card style={{ gap: 12 }}>
          <Text className="text-lg font-semibold text-ink">VisitCard</Text>
          <VisitCard
            beneficiaryName="Alex Morgan"
            doctorName="Dr. Amelia Thorne"
            endsAt={demoTime(13)}
            room="Cardiology 4"
            startsAt={demoTime(9)}
            status="upcoming"
          />
          <VisitCard
            beneficiaryName="Jordan Morgan"
            doctorName="Dr. Chidi Okafor"
            endsAt={demoTime(17)}
            proxyTag="Booked for Jordan Morgan [child]"
            startsAt={demoTime(14)}
            status="upcoming"
          />
          <VisitCard
            beneficiaryName="Alex Morgan"
            doctorName="Dr. Amelia Thorne"
            endsAt={demoTime(12)}
            startsAt={demoTime(8)}
            status="cancelled"
          />
        </Card>

        <Card style={{ gap: 12 }}>
          <Text className="text-lg font-semibold text-ink">Sheet</Text>
          <Pressable
            accessibilityLabel="Open sample sheet"
            accessibilityRole="button"
            className="min-h-12 items-center justify-center rounded-xl bg-primary px-4 web:hover:opacity-90"
            onPress={() => setSheetOpen(true)}
          >
            <Text className="text-base font-semibold text-surface">
              Open sheet
            </Text>
          </Pressable>
        </Card>

        <Card style={{ gap: 12 }}>
          <Text className="text-lg font-semibold text-ink">
            Scheduling failure injection
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {(
              ["SESSION_UNAVAILABLE", "NETWORK_ERROR"] as const
            ).map((code) => (
              <Pressable
                key={code}
                accessibilityLabel={`Inject ${code}`}
                accessibilityRole="button"
                className="min-h-12 justify-center rounded-xl border border-ink-muted bg-surface px-4 web:hover:opacity-90"
                onPress={() => injectFailure(code)}
              >
                <Text className="text-sm font-semibold text-ink">{code}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable
            accessibilityLabel="Call list doctors to test injection"
            accessibilityRole="button"
            className="min-h-12 items-center justify-center rounded-xl bg-primary px-4 web:hover:opacity-90"
            onPress={() => void probeFailure()}
          >
            <Text className="text-base font-semibold text-surface">
              Probe listDoctors()
            </Text>
          </Pressable>
          {failureMessage ? (
            <Text accessibilityLiveRegion="polite" className="text-sm text-ink">
              {failureMessage}
            </Text>
          ) : null}
        </Card>
      </ScrollView>

      <Sheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        title="Sample sheet"
      >
        <Text className="text-base text-ink-muted">
          Beneficiary selection and add-patient flows will use this abstraction.
        </Text>
        <Pressable
          accessibilityLabel="Close sample sheet"
          accessibilityRole="button"
          className="min-h-12 items-center justify-center rounded-xl border border-primary px-4 web:hover:opacity-90"
          onPress={() => setSheetOpen(false)}
        >
          <Text className="text-base font-semibold text-primary">Close</Text>
        </Pressable>
      </Sheet>
    </>
  );
}
