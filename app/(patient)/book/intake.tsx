import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Stack, router } from "expo-router";

import { Card } from "@/components/ui/card";
import { FormTextInput } from "@/components/ui/form-text-input";
import { formatSessionWhen } from "@/lib/session-groups";
import { useBookingStore } from "@/lib/stores/booking";

export default function BookIntakeScreen() {
  const setIntake = useBookingStore((state) => state.setIntake);
  const doctorName = useBookingStore((state) => state.doctorName);
  const session = useBookingStore((state) => state.session);
  const savedReason = useBookingStore((state) => state.reason);
  const savedNotes = useBookingStore((state) => state.notes);
  const [reason, setReason] = useState(savedReason);
  const [notes, setNotes] = useState(savedNotes);

  const continueToConfirm = () => {
    setIntake(reason, notes);
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
            {session ? formatSessionWhen(session) : "Session selected"}
          </Text>
        </Card>

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
            <Text className="text-sm font-medium text-ink">Notes for the doctor (optional)</Text>
            <FormTextInput
              accessibilityLabel="Notes for the doctor"
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
