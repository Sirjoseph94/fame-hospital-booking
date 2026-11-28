import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { FormTextInput } from "@/components/ui/form-text-input";
import { Sheet } from "@/components/ui/sheet";
import { useUpdateSession } from "@/lib/queries/sessions";
import { SchedulingError } from "@/lib/services/scheduling";
import { formatSessionWhen } from "@/lib/session-groups";
import type { ClinicSession } from "@/types/scheduling";

interface EditSessionSheetProps {
  /** Render with key={session.id} so the form resets per session. */
  session: ClinicSession;
  onOpenChange: (open: boolean) => void;
  onSaved: (message: string) => void;
}

/** Change an upcoming session's room and patient limit. */
export function EditSessionSheet({ session, onOpenChange, onSaved }: EditSessionSheetProps) {
  const update = useUpdateSession();
  const [room, setRoom] = useState(session.room ?? "");
  const [capacity, setCapacity] = useState(String(session.capacity));
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const limit = Number.parseInt(capacity, 10);
    if (!/^\d+$/.test(capacity.trim()) || limit < 1 || limit > 200) {
      setError("Enter a patient limit between 1 and 200.");
      return;
    }
    if (limit < session.bookedCount) {
      setError(
        `${session.bookedCount} patients are already booked, so the limit can't be lower than that.`,
      );
      return;
    }
    setError(null);
    try {
      await update.mutateAsync({ sessionId: session.id, room, capacity: limit });
      onSaved("Session updated.");
      onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof SchedulingError ? cause.message : "Could not update the session.");
    }
  };

  return (
    <Sheet open onOpenChange={onOpenChange} title="Edit session" accessibilityLabel="Edit session">
      <Text className="text-sm text-ink-muted">{formatSessionWhen(session)}</Text>
      <View className="gap-1">
        <Text className="text-sm font-medium text-ink">Room</Text>
        <FormTextInput
          accessibilityLabel="Room"
          maxLength={40}
          onChangeText={setRoom}
          placeholder="e.g. Consulting room 3"
          value={room}
        />
      </View>
      <View className="gap-1">
        <Text className="text-sm font-medium text-ink">Patient limit</Text>
        <FormTextInput
          accessibilityLabel="Patient limit"
          kind="number"
          maxLength={3}
          onChangeText={setCapacity}
          value={capacity}
        />
        <Text className="text-xs text-ink-muted">
          {session.bookedCount} already booked.
        </Text>
      </View>
      {error ? (
        <Text accessibilityLiveRegion="assertive" className="text-sm text-danger">
          {error}
        </Text>
      ) : null}
      <Pressable
        accessibilityLabel="Save session"
        accessibilityRole="button"
        accessibilityState={{ disabled: update.isPending, busy: update.isPending }}
        className="min-h-12 items-center justify-center rounded-xl bg-primary px-4 web:hover:opacity-90"
        disabled={update.isPending}
        onPress={() => void save()}
      >
        <Text className="text-base font-semibold text-surface">
          {update.isPending ? "Saving…" : "Save"}
        </Text>
      </Pressable>
    </Sheet>
  );
}
