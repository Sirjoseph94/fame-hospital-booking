import { useEffect, useState } from "react";
import { AccessibilityInfo, Pressable, ScrollView, Text, View } from "react-native";
import { Stack, router } from "expo-router";

import { AppointmentTypeToggle } from "@/components/ui/appointment-type-toggle";
import { Card } from "@/components/ui/card";
import { FormTextInput } from "@/components/ui/form-text-input";
import { profileService } from "@/lib/services/profile";
import { useBookingStore } from "@/lib/stores/booking";
import { useSessionStore } from "@/lib/stores/session";

export default function BookIntakeScreen() {
  const session = useSessionStore((state) => state.session);
  const appointmentType = useBookingStore((state) => state.appointmentType);
  const setAppointmentType = useBookingStore((state) => state.setAppointmentType);
  const setIntake = useBookingStore((state) => state.setIntake);
  const visitAddress = useBookingStore((state) => state.visitAddress);
  const doctorName = useBookingStore((state) => state.doctorName);
  const slotStartsAt = useBookingStore((state) => state.slotStartsAt);
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [address, setAddress] = useState(visitAddress);
  const [addressError, setAddressError] = useState<string | null>(null);

  useEffect(() => {
    if (!session || address.trim()) {
      return;
    }
    void profileService.getPatientProfile(session.userId).then((profile) => {
      if (profile.address) {
        setAddress(profile.address);
      }
    });
  }, [address, session]);

  const continueToConfirm = () => {
    if (appointmentType === "home-visit" && address.trim().length < 5) {
      setAddressError("Enter the address for this home visit.");
      AccessibilityInfo.announceForAccessibility(
        "Enter the address for this home visit.",
      );
      return;
    }
    setAddressError(null);
    setIntake(reason, notes, appointmentType === "home-visit" ? address.trim() : "");
    router.push("/book/confirmation");
  };

  return (
    <>
      <Stack.Screen options={{ title: "Visit details" }} />
      <ScrollView
        className="flex-1 bg-surface-muted"
        contentContainerClassName="gap-4 px-4 py-4"
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
      >
        <Card style={{ gap: 8 }}>
          <Text className="text-base font-semibold text-ink">Review</Text>
          <Text className="text-sm text-ink-muted">{doctorName}</Text>
          <Text className="text-sm text-ink" selectable>
            {slotStartsAt ?? "Time selected"}
          </Text>
        </Card>

        <Card style={{ gap: 12 }}>
          <Text className="text-base font-semibold text-ink">Visit type</Text>
          <AppointmentTypeToggle
            value={appointmentType}
            onChange={setAppointmentType}
          />
        </Card>

        {appointmentType === "home-visit" ? (
          <Card style={{ gap: 12 }}>
            <View className="gap-2">
              <Text className="text-sm font-medium text-ink">Home visit address</Text>
              <FormTextInput
                accessibilityLabel="Home visit address"
                kind="multiline"
                maxLength={300}
                onChangeText={(value) => {
                  setAddress(value);
                  setAddressError(null);
                }}
                value={address}
              />
              {addressError ? (
                <Text accessibilityLiveRegion="assertive" className="text-sm text-ink">
                  {addressError}
                </Text>
              ) : null}
            </View>
          </Card>
        ) : null}

        <Card style={{ gap: 12 }}>
          <View className="gap-2">
            <Text className="text-sm font-medium text-ink">
              Reason for visit (optional)
            </Text>
            <FormTextInput
              accessibilityLabel="Reason for visit"
              maxLength={200}
              onChangeText={setReason}
              value={reason}
            />
          </View>
          <View className="gap-2">
            <Text className="text-sm font-medium text-ink">Notes (optional)</Text>
            <FormTextInput
              accessibilityLabel="Additional notes"
              kind="multiline"
              maxLength={500}
              onChangeText={setNotes}
              value={notes}
            />
          </View>
        </Card>

        <Pressable
          accessibilityLabel="Continue to confirmation"
          accessibilityRole="button"
          className="min-h-12 items-center justify-center rounded-xl bg-primary px-4 web:hover:opacity-90"
          onPress={continueToConfirm}
        >
          <Text className="text-base font-semibold text-surface">Continue</Text>
        </Pressable>
      </ScrollView>
    </>
  );
}
