import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { ChevronDown, ChevronUp } from "lucide-react-native";

import { PatientDetails } from "@/components/doctor/patient-details";
import { Card } from "@/components/ui/card";
import { visitStatusLabel } from "@/lib/visit-status-label";
import { colors } from "@/lib/theme-colors";
import type {
  Appointment,
  AppointmentDbStatus,
  AppointmentStatus,
} from "@/types/scheduling";

interface DoctorVisitCardProps {
  /** When set, the card offers an expandable patient summary. */
  appointment?: Appointment;
  /** 1-based booking number within the session (not the arrival order). */
  position?: number;
  beneficiaryName: string;
  /** Session start, for the status label. */
  startsAt: string;
  status: AppointmentStatus;
  dbStatus?: AppointmentDbStatus;
  proxyTag?: string;
  reason?: string;
  notes?: string;
  onMarkComplete?: () => void;
  onCancel?: () => void;
  manageBusy?: boolean;
}

/** One patient booked into a session, on the doctor's agenda. */
export function DoctorVisitCard({
  appointment,
  position,
  beneficiaryName,
  startsAt,
  status,
  dbStatus,
  proxyTag,
  reason,
  notes,
  onMarkComplete,
  onCancel,
  manageBusy = false,
}: DoctorVisitCardProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const statusLabel = visitStatusLabel(status, dbStatus, "doctor", startsAt);
  const summary = `${position ? `Booking ${position}, ` : ""}${beneficiaryName}, ${statusLabel}`;
  const details = [reason?.trim(), notes?.trim()].filter(Boolean);
  const showActions = status === "upcoming" && Boolean(onMarkComplete || onCancel);

  return (
    <View accessibilityLabel={summary}>
      <Card style={{ gap: 10 }}>
        <View className="flex-row items-start justify-between gap-3">
          <View className="min-w-0 flex-1 flex-row items-start gap-3">
            {position ? (
              <View className="h-8 w-8 items-center justify-center rounded-full bg-surface-muted">
                <Text className="text-sm font-semibold text-ink-muted">{position}</Text>
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
            </View>
          </View>
          <View className="rounded-full bg-surface-muted px-3 py-1">
            <Text className="text-xs font-semibold uppercase text-ink-muted">
              {statusLabel}
            </Text>
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
                {reason?.trim() ? (
                  <Text className="text-sm text-ink" selectable>
                    Reason: {reason.trim()}
                  </Text>
                ) : null}
                {notes?.trim() ? (
                  <Text className="text-sm text-ink-muted" selectable>
                    Notes: {notes.trim()}
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

        {appointment ? <PatientDetails appointment={appointment} /> : null}

        {showActions ? (
          <View className="flex-row flex-wrap gap-2 border-t border-surface-muted pt-3">
            {onMarkComplete ? (
              <Pressable
                accessibilityLabel={`Mark ${beneficiaryName} seen`}
                accessibilityRole="button"
                accessibilityState={{ disabled: manageBusy, busy: manageBusy }}
                className="min-h-12 flex-1 items-center justify-center rounded-xl bg-primary px-3 web:hover:opacity-90"
                disabled={manageBusy}
                onPress={onMarkComplete}
              >
                <Text className="text-sm font-semibold text-surface">Mark seen</Text>
              </Pressable>
            ) : null}
            {onCancel ? (
              <Pressable
                accessibilityLabel={`Cancel ${beneficiaryName}'s booking`}
                accessibilityRole="button"
                accessibilityState={{ disabled: manageBusy, busy: manageBusy }}
                className="min-h-12 flex-1 items-center justify-center rounded-xl border border-ink-muted px-3 web:hover:opacity-90"
                disabled={manageBusy}
                onPress={onCancel}
              >
                <Text className="text-sm font-semibold text-ink-muted">Cancel booking</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </Card>
    </View>
  );
}
