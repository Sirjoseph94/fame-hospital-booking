import { useState } from "react";
import {
  AccessibilityInfo,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { Stack } from "expo-router";
import { addDays, setHours, setMinutes } from "date-fns";

import { AppointmentTypeToggle } from "@/components/ui/appointment-type-toggle";
import { BeneficiaryPill } from "@/components/ui/beneficiary-pill";
import { Card } from "@/components/ui/card";
import { Sheet } from "@/components/ui/sheet";
import { SlotChip, type SlotChipVariant } from "@/components/ui/slot-chip";
import { VisitCard } from "@/components/ui/visit-card";
import { isWeb } from "@/lib/platform";
import {
  SchedulingError,
  schedulingService,
} from "@/lib/services/scheduling";
import type { AppointmentType } from "@/types/scheduling";

function demoTime(hour: number, minute = 0): string {
  return setMinutes(setHours(addDays(new Date(), 1), hour), minute).toISOString();
}

const slotVariants: { variant: SlotChipVariant; label: string }[] = [
  { variant: "available", label: "9:00 AM" },
  { variant: "selected", label: "9:30 AM" },
  { variant: "held-by-other", label: "10:00 AM" },
  { variant: "booked", label: "10:30 AM" },
  { variant: "blackout", label: "11:00 AM" },
];

export default function KitchenSinkScreen() {
  const [appointmentType, setAppointmentType] =
    useState<AppointmentType>("in-clinic");
  const [selectedBeneficiary, setSelectedBeneficiary] = useState("self");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [failureMessage, setFailureMessage] = useState<string | null>(null);

  const injectFailure = (code: "SLOT_TAKEN" | "HOLD_EXPIRED" | "NETWORK_ERROR") => {
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
          <Text className="text-lg font-semibold text-ink">SlotChip</Text>
          <View
            accessibilityLabel="Slot picker grid"
            className="flex-row flex-wrap gap-2"
          >
            {slotVariants.map(({ variant, label }) => (
              <SlotChip
                key={variant}
                label={label}
                variant={variant}
                onPress={
                  variant === "available" || variant === "selected"
                    ? () => undefined
                    : undefined
                }
              />
            ))}
          </View>
        </Card>

        <Card style={{ gap: 12 }}>
          <Text className="text-lg font-semibold text-ink">
            AppointmentTypeToggle
          </Text>
          <AppointmentTypeToggle
            value={appointmentType}
            onChange={setAppointmentType}
          />
        </Card>

        <Card style={{ gap: 12 }}>
          <Text className="text-lg font-semibold text-ink">VisitCard</Text>
          <VisitCard
            beneficiaryName="Alex Morgan"
            doctorName="Dr. Amelia Thorne"
            room="Cardiology 4"
            startsAt={demoTime(9)}
            status="upcoming"
            type="in-clinic"
          />
          <VisitCard
            beneficiaryName="Jordan Morgan"
            doctorName="Dr. Chidi Okafor"
            proxyTag="Booked by Alex Morgan [child]"
            startsAt={demoTime(14, 30)}
            status="upcoming"
            telehealthJoinLabel="Join in 15 min"
            type="telehealth"
            onJoinTelehealth={() => undefined}
          />
          <VisitCard
            beneficiaryName="Alex Morgan"
            doctorName="Dr. Amelia Thorne"
            startsAt={demoTime(8)}
            status="cancelled"
            type="in-clinic"
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
              ["SLOT_TAKEN", "HOLD_EXPIRED", "NETWORK_ERROR"] as const
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
