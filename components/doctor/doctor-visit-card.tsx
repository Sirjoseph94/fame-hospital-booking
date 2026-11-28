import { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { ChevronDown, ChevronUp } from "lucide-react-native";

import { PatientDetails } from "@/components/doctor/patient-details";
import { Card } from "@/components/ui/card";
import { visitStage, visitStatusLabel } from "@/lib/visit-status-label";
import { colors } from "@/lib/theme-colors";
import type { Appointment } from "@/types/scheduling";

export interface VisitCardAction {
  key: string;
  label: string;
  /** Spoken label when the visible one is short ("Call in" → "Call Ada in"). */
  accessibilityLabel?: string;
  tone?: "primary" | "secondary" | "danger";
  onPress: () => void;
}

interface DoctorVisitCardProps {
  appointment: Appointment;
  beneficiaryName: string;
  /** Session start, for the status label. */
  startsAt: string;
  proxyTag?: string;
  /** "Admin" wording uses the same labels as doctors. */
  audience?: "doctor" | "admin";
  actions?: VisitCardAction[];
  /** An action for this card is in flight. */
  busy?: boolean;
  /** Draws attention (the patient being seen now). */
  highlight?: boolean;
}

const STAGE_BADGE: Record<string, string> = {
  waiting: "bg-primary/10",
  "with-doctor": "bg-available/15",
  "no-show": "bg-danger/10",
};

/** One booked patient in a session (doctor agenda, admin session queue). */
export function DoctorVisitCard({
  appointment,
  beneficiaryName,
  startsAt,
  proxyTag,
  audience = "doctor",
  actions = [],
  busy = false,
  highlight = false,
}: DoctorVisitCardProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const stage = visitStage(appointment);
  const statusLabel = visitStatusLabel(
    appointment.status,
    appointment.dbStatus,
    audience,
    startsAt,
    new Date(),
    appointment,
  );
  const reason = appointment.reason?.trim();
  const notes = appointment.notes?.trim();
  const details = [reason, notes].filter(Boolean);
  const number = appointment.queueNumber;
  const summary = `${number ? `Number ${number}, ` : ""}${beneficiaryName}, ${statusLabel}`;

  return (
    <View accessibilityLabel={summary}>
      <Card style={[{ gap: 10 }, highlight ? { borderWidth: 2, borderColor: colors.available } : null]}>
        <View className="flex-row items-start justify-between gap-3">
          <View className="min-w-0 flex-1 flex-row items-start gap-3">
            {number ? (
              <View className="h-9 w-9 items-center justify-center rounded-full bg-primary">
                <Text className="text-sm font-bold text-surface">{number}</Text>
              </View>
            ) : null}
            <View className="min-w-0 flex-1 gap-1">
              <Text className="text-base font-semibold text-ink" selectable>
                {beneficiaryName}
              </Text>
              {proxyTag ? (
                <Text className="text-sm text-ink-muted" selectable>
                  {proxyTag}
                </Text>
              ) : null}
              {appointment.source === "follow_up" ? (
                <Text className="text-xs font-medium text-primary">Follow-up</Text>
              ) : appointment.source === "waitlist" ? (
                <Text className="text-xs font-medium text-primary">From waitlist</Text>
              ) : null}
            </View>
          </View>
          <View className={`rounded-full px-3 py-1 ${STAGE_BADGE[stage] ?? "bg-surface-muted"}`}>
            <Text className="text-xs font-semibold uppercase text-ink-muted">{statusLabel}</Text>
          </View>
        </View>

        {details.length > 0 ? (
          <View className="gap-2">
            <Pressable
              accessibilityLabel={detailsOpen ? "Hide reason and notes" : "Show reason and notes"}
              accessibilityRole="button"
              accessibilityState={{ expanded: detailsOpen }}
              className="min-h-11 flex-row items-center justify-between web:hover:opacity-80"
              onPress={() => setDetailsOpen((open) => !open)}
            >
              <Text className="text-sm font-semibold text-primary">Reason & notes</Text>
              {detailsOpen ? (
                <ChevronUp color={colors.primary} size={18} />
              ) : (
                <ChevronDown color={colors.primary} size={18} />
              )}
            </Pressable>
            {detailsOpen ? (
              <View className="gap-1">
                {reason ? (
                  <Text className="text-sm text-ink" selectable>
                    Reason: {reason}
                  </Text>
                ) : null}
                {notes ? (
                  <Text className="text-sm text-ink-muted" selectable>
                    Notes: {notes}
                  </Text>
                ) : null}
              </View>
            ) : (
              <Text className="text-sm text-ink-muted" numberOfLines={1}>
                {details.join(" · ")}
              </Text>
            )}
          </View>
        ) : null}

        <PatientDetails appointment={appointment} />

        {actions.length > 0 ? (
          <View className="flex-row flex-wrap gap-2 border-t border-surface-muted pt-3">
            {actions.map((action) => {
              const tone = action.tone ?? "secondary";
              return (
                <Pressable
                  key={action.key}
                  accessibilityLabel={action.accessibilityLabel ?? action.label}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: busy, busy }}
                  className={[
                    "min-h-12 min-w-[30%] flex-1 items-center justify-center rounded-xl px-3 web:hover:opacity-90 active:opacity-80",
                    tone === "primary"
                      ? "bg-primary"
                      : tone === "danger"
                        ? "border border-danger"
                        : "border border-ink-muted",
                    busy ? "opacity-60" : "",
                  ].join(" ")}
                  disabled={busy}
                  onPress={action.onPress}
                >
                  {busy && tone === "primary" ? (
                    <ActivityIndicator color={colors.surface} />
                  ) : (
                    <Text
                      className={[
                        "text-sm font-semibold",
                        tone === "primary" ? "text-surface" : tone === "danger" ? "text-danger" : "text-ink",
                      ].join(" ")}
                    >
                      {action.label}
                    </Text>
                  )}
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </Card>
    </View>
  );
}
