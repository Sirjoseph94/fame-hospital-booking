import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { FormTextInput } from "@/components/ui/form-text-input";
import { Sheet } from "@/components/ui/sheet";
import { useJoinWaitlist } from "@/lib/queries/visit-flow";
import { SchedulingError } from "@/lib/services/scheduling";
import { formatSessionWhen } from "@/lib/session-groups";
import type { ClinicSession } from "@/types/scheduling";

interface JoinWaitlistSheetProps {
  /** Render with key={session.id}. */
  session: ClinicSession;
  beneficiaryId: string;
  doctorName: string;
  onOpenChange: (open: boolean) => void;
  onJoined: (position: number) => void;
}

/** A full session: join its waitlist and be booked automatically if a place frees up. */
export function JoinWaitlistSheet({ session, beneficiaryId, doctorName, onOpenChange, onJoined }: JoinWaitlistSheetProps) {
  const join = useJoinWaitlist();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const ahead = session.waitlistCount;

  const submit = async () => {
    setError(null);
    try {
      const { position } = await join.mutateAsync({ sessionId: session.id, beneficiaryId, reason });
      onJoined(position);
      onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof SchedulingError ? cause.message : "Could not join the waitlist.");
    }
  };

  return (
    <Sheet open onOpenChange={onOpenChange} title="Join the waitlist" accessibilityLabel="Join the waitlist">
      <Text className="text-base text-ink">
        {doctorName} · {formatSessionWhen(session)}
      </Text>
      <Text className="text-sm text-ink-muted">
        This session is full. {ahead > 0 ? `${ahead} ${ahead === 1 ? "person is" : "people are"} already waiting. ` : ""}
        If someone cancels, the first person waiting is booked automatically and told straight away.
      </Text>
      <View className="gap-1">
        <Text className="text-sm font-medium text-ink">Reason for the visit (optional)</Text>
        <FormTextInput
          accessibilityLabel="Reason for the visit"
          maxLength={200}
          onChangeText={setReason}
          placeholder="e.g. Follow-up on blood pressure"
          value={reason}
        />
      </View>
      {error ? (
        <Text accessibilityLiveRegion="assertive" className="text-sm text-danger">
          {error}
        </Text>
      ) : null}
      <Pressable
        accessibilityLabel="Join the waitlist"
        accessibilityRole="button"
        accessibilityState={{ disabled: join.isPending, busy: join.isPending }}
        className="min-h-12 items-center justify-center rounded-xl bg-primary px-4 web:hover:opacity-90 active:opacity-80"
        disabled={join.isPending}
        onPress={() => void submit()}
      >
        <Text className="text-base font-semibold text-surface">{join.isPending ? "Joining…" : "Join the waitlist"}</Text>
      </Pressable>
    </Sheet>
  );
}
