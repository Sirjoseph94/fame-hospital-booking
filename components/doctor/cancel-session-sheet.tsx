import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { FormTextInput } from "@/components/ui/form-text-input";
import { Sheet } from "@/components/ui/sheet";
import { formatSessionWhen } from "@/lib/session-groups";
import type { ClinicSession } from "@/types/scheduling";

interface CancelSessionSheetProps {
  /** Render with key={session.id} so the reason resets per session. */
  session: ClinicSession;
  busy: boolean;
  error: string | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => void;
}

/** Confirm cancelling a session, with an optional reason sent to patients. */
export function CancelSessionSheet({
  session,
  busy,
  error,
  onOpenChange,
  onConfirm,
}: CancelSessionSheetProps) {
  const [reason, setReason] = useState("");
  const booked = session.bookedCount;

  return (
    <Sheet
      open
      onOpenChange={onOpenChange}
      title={booked > 0 ? "Cancel session" : "Remove session"}
      accessibilityLabel={booked > 0 ? "Cancel session" : "Remove session"}
    >
      <Text className="text-sm text-ink">{formatSessionWhen(session)}</Text>
      {booked > 0 ? (
        <>
          <Text className="text-sm text-ink-muted">
            {booked} booked {booked === 1 ? "patient" : "patients"} will be told the
            session is cancelled and asked to book another.
          </Text>
          <View className="gap-1">
            <Text className="text-sm font-medium text-ink">Reason (optional, shown to patients)</Text>
            <FormTextInput
              accessibilityLabel="Reason for cancelling"
              maxLength={120}
              onChangeText={setReason}
              placeholder="e.g. Doctor unwell"
              value={reason}
            />
          </View>
        </>
      ) : (
        <Text className="text-sm text-ink-muted">Nobody has booked it yet, so it will be removed.</Text>
      )}
      {error ? (
        <Text accessibilityLiveRegion="assertive" className="text-sm text-danger">
          {error}
        </Text>
      ) : null}
      <Pressable
        accessibilityLabel={booked > 0 ? "Cancel session and notify patients" : "Remove session"}
        accessibilityRole="button"
        accessibilityState={{ disabled: busy, busy }}
        className="min-h-12 items-center justify-center rounded-xl bg-danger px-4 web:hover:opacity-90"
        disabled={busy}
        onPress={() => onConfirm(reason)}
      >
        <Text className="text-base font-semibold text-surface">
          {busy ? "Working…" : booked > 0 ? "Cancel session" : "Remove session"}
        </Text>
      </Pressable>
      <Pressable
        accessibilityLabel="Keep session"
        accessibilityRole="button"
        className="min-h-12 items-center justify-center rounded-xl border border-ink-muted px-4 web:hover:opacity-90"
        onPress={() => onOpenChange(false)}
      >
        <Text className="text-base font-semibold text-ink">Keep it</Text>
      </Pressable>
    </Sheet>
  );
}
