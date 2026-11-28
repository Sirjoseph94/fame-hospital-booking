import { AccessibilityInfo, Pressable, Text, View } from "react-native";

import { Card } from "@/components/ui/card";
import { confirmAsync, showAlert } from "@/lib/confirm";
import { useLeaveWaitlist, useMyWaitlist } from "@/lib/queries/visit-flow";
import { SchedulingError } from "@/lib/services/scheduling";
import { formatSessionWhen } from "@/lib/session-groups";

interface WaitlistCardProps {
  userId: string;
  doctorName: (doctorId: string) => string;
  patientName: (beneficiaryId: string) => string;
}

/** My Visits: sessions the patient is waiting for a place in. */
export function WaitlistCard({ userId, doctorName, patientName }: WaitlistCardProps) {
  const waitlistQuery = useMyWaitlist(userId);
  const leave = useLeaveWaitlist();
  const entries = waitlistQuery.data ?? [];
  if (entries.length === 0) {
    return null;
  }

  const leaveEntry = async (entryId: string, label: string) => {
    const confirmed = await confirmAsync({
      title: "Leave the waitlist?",
      message: `You won't be booked into ${label} if a place frees up.`,
      confirmText: "Leave waitlist",
      cancelText: "Stay on it",
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await leave.mutateAsync(entryId);
      AccessibilityInfo.announceForAccessibility("Left the waitlist.");
    } catch (cause) {
      showAlert("Could not leave the waitlist", cause instanceof SchedulingError ? cause.message : "Try again.");
    }
  };

  return (
    <Card style={{ gap: 10 }}>
      <View className="gap-0.5">
        <Text accessibilityRole="header" className="text-base font-semibold text-ink">
          Waitlists
        </Text>
        <Text className="text-sm text-ink-muted">
          If a place frees up you&apos;re booked automatically and we&apos;ll tell you.
        </Text>
      </View>
      {entries.map((entry) => {
        const when = formatSessionWhen(entry);
        const doctor = doctorName(entry.doctorId);
        return (
          <View key={entry.id} className="flex-row items-center gap-3 border-t border-surface-muted pt-3">
            <View className="min-w-0 flex-1 gap-0.5">
              <Text className="text-sm font-semibold text-ink">
                {patientName(entry.beneficiaryId)} · {doctor}
              </Text>
              <Text className="text-sm text-ink-muted">{when}</Text>
              <Text className="text-xs font-medium text-primary">
                {entry.position === 1 ? "Next in line for a place" : `Number ${entry.position} on the waitlist`}
              </Text>
            </View>
            <Pressable
              accessibilityLabel={`Leave the waitlist for ${doctor}, ${when}`}
              accessibilityRole="button"
              accessibilityState={{ disabled: leave.isPending }}
              className="min-h-11 justify-center rounded-lg border border-ink-muted px-3 web:hover:opacity-90 active:opacity-80"
              disabled={leave.isPending}
              onPress={() => void leaveEntry(entry.id, `${doctor}'s session`)}
            >
              <Text className="text-sm font-semibold text-ink">Leave</Text>
            </Pressable>
          </View>
        );
      })}
    </Card>
  );
}
