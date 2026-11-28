import { useState } from "react";
import { AccessibilityInfo, Pressable, Text, View } from "react-native";

import { canScanQr, QrScanner } from "@/components/patient/qr-scanner";
import { FormTextInput } from "@/components/ui/form-text-input";
import { Sheet } from "@/components/ui/sheet";
import { useCheckIn } from "@/lib/queries/visit-flow";
import { normalizeCheckInCode, SchedulingError } from "@/lib/services/scheduling";

interface CheckInSheetProps {
  /** Render with key={appointmentId}. */
  appointmentId: string;
  patientName: string;
  doctorName: string;
  /** Code from a scanned poster link (fame-hospital://check-in?code=…). */
  initialCode?: string;
  onOpenChange: (open: boolean) => void;
  onCheckedIn: (result: { queueNumber: number; position?: number }) => void;
}

/** Scan the reception QR code (or type its code) to join the queue. */
export function CheckInSheet({
  appointmentId,
  patientName,
  doctorName,
  initialCode,
  onOpenChange,
  onCheckedIn,
}: CheckInSheetProps) {
  const checkIn = useCheckIn();
  const [code, setCode] = useState(initialCode ?? "");
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(canScanQr && !initialCode);

  const submit = async (value: string) => {
    const normalized = normalizeCheckInCode(value);
    if (normalized.length !== 6) {
      setError("The code has 6 letters and numbers. It's printed under the QR code at reception.");
      return;
    }
    setError(null);
    try {
      const result = await checkIn.mutateAsync({ appointmentId, code: normalized });
      AccessibilityInfo.announceForAccessibility(`Checked in. Your number is ${result.queueNumber}.`);
      onCheckedIn(result);
      onOpenChange(false);
    } catch (cause) {
      setScanning(false);
      setError(cause instanceof SchedulingError ? cause.message : "Could not check in. Try again.");
    }
  };

  return (
    <Sheet open onOpenChange={onOpenChange} title="Check in" accessibilityLabel="Check in at reception">
      <Text className="text-sm text-ink-muted">
        {patientName} with {doctorName}. You join the queue in order of arrival.
      </Text>
      {initialCode ? (
        <Text className="text-sm text-ink">Code from the poster you scanned. Tap Check in to join the queue.</Text>
      ) : null}

      {scanning ? (
        <View className="gap-2">
          <QrScanner
            onCode={(scanned) => {
              setCode(scanned);
              void submit(scanned);
            }}
            onInvalid={() => setError("That isn't the hospital's check-in code. Scan the poster at reception.")}
          />
          {checkIn.isPending ? (
            <Text accessibilityLiveRegion="polite" className="text-center text-base font-semibold text-ink">
              Checking in…
            </Text>
          ) : null}
          <Pressable
            accessibilityRole="button"
            className="min-h-11 items-center justify-center"
            onPress={() => setScanning(false)}
          >
            <Text className="text-sm font-semibold text-primary">Type the code instead</Text>
          </Pressable>
        </View>
      ) : (
        <View className="gap-2">
          <Text className="text-sm font-medium text-ink">Check-in code (under the QR code at reception)</Text>
          <FormTextInput
            accessibilityLabel="Check-in code"
            autoCapitalize="characters"
            autoComplete="off"
            autoCorrect={false}
            className="text-center text-2xl font-bold tracking-[6px]"
            maxLength={7}
            onChangeText={(text) => setCode(text.toUpperCase())}
            onSubmitEditing={() => void submit(code)}
            placeholder="ABC 123"
            returnKeyType="go"
            value={code}
          />
          {canScanQr ? (
            <Pressable
              accessibilityRole="button"
              className="min-h-11 items-center justify-center"
              onPress={() => {
                setError(null);
                setScanning(true);
              }}
            >
              <Text className="text-sm font-semibold text-primary">Scan the QR code instead</Text>
            </Pressable>
          ) : null}
        </View>
      )}

      {error ? (
        <Text accessibilityLiveRegion="assertive" className="text-sm text-danger">
          {error}
        </Text>
      ) : null}

      {!scanning ? (
        <Pressable
          accessibilityLabel="Check in"
          accessibilityRole="button"
          accessibilityState={{ disabled: checkIn.isPending, busy: checkIn.isPending }}
          className="min-h-12 items-center justify-center rounded-xl bg-primary px-4 web:hover:opacity-90 active:opacity-80"
          disabled={checkIn.isPending}
          onPress={() => void submit(code)}
        >
          <Text className="text-base font-semibold text-surface">
            {checkIn.isPending ? "Checking in…" : "Check in"}
          </Text>
        </Pressable>
      ) : null}
      <Text className="text-xs text-ink-muted">No phone signal or trouble checking in? Ask at the reception desk.</Text>
    </Sheet>
  );
}
