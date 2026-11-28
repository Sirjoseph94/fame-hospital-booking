import { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { differenceInYears, format, isValid, parseISO } from "date-fns";
import { ChevronDown, ChevronUp } from "lucide-react-native";

import { usePatientSummary } from "@/lib/queries/appointments";
import { SchedulingError } from "@/lib/services/scheduling";
import { colors } from "@/lib/theme-colors";
import type { Appointment, PatientSummary } from "@/types/scheduling";

function ageLabel(dob?: string): string | null {
  if (!dob) {
    return null;
  }
  const date = parseISO(dob);
  if (!isValid(date)) {
    return null;
  }
  const years = differenceInYears(new Date(), date);
  return `${years} ${years === 1 ? "year" : "years"} (born ${format(date, "d MMM yyyy")})`;
}

function Row({ label, value }: { label: string; value?: string | null }) {
  if (!value) {
    return null;
  }
  return (
    <View className="gap-0.5">
      <Text className="text-xs font-semibold uppercase text-ink-muted">{label}</Text>
      <Text className="text-sm text-ink" selectable>
        {value}
      </Text>
    </View>
  );
}

function SummaryBody({ summary }: { summary: PatientSummary }) {
  const gender = summary.gender
    ? summary.gender.charAt(0).toUpperCase() + summary.gender.slice(1)
    : null;
  const health = summary.health;
  const hasHealth =
    health &&
    (health.bloodType || health.allergies || health.medications || health.conditions || health.notes);
  const contact = [summary.holderPhone, summary.relationship === "self" ? null : `${summary.holderName} (booked)`]
    .filter(Boolean)
    .join(" · ");

  return (
    <View className="gap-3">
      <Row label="Age" value={ageLabel(summary.dob)} />
      <Row label="Gender" value={gender} />
      <Row label="Hospital file no." value={summary.hospitalFileId} />
      <Row label="National ID" value={summary.nationalId} />
      <Row label="Contact" value={contact || null} />
      <Row
        label="Emergency contact"
        value={
          summary.emergencyContactName || summary.emergencyContactPhone
            ? [summary.emergencyContactName, summary.emergencyContactPhone].filter(Boolean).join(" · ")
            : null
        }
      />

      {summary.relationship === "self" ? (
        hasHealth ? (
          <>
            <Row label="Blood type" value={health?.bloodType} />
            <Row label="Allergies" value={health?.allergies} />
            <Row label="Medications" value={health?.medications} />
            <Row label="Conditions" value={health?.conditions} />
            <Row label="Notes for clinicians" value={health?.notes} />
          </>
        ) : (
          <Text className="text-sm text-ink-muted">No health details on file.</Text>
        )
      ) : (
        <Text className="text-sm text-ink-muted">
          Booked by {summary.holderName} for their {summary.relationship}. Health
          details in the app belong to the account holder, so they aren&apos;t shown here.
        </Text>
      )}

      <Row
        label="Previous visits with you"
        value={
          summary.previousVisitDates.length > 0
            ? summary.previousVisitDates
                .map((date) => format(parseISO(date), "d MMM yyyy"))
                .join(", ")
            : "None"
        }
      />
    </View>
  );
}

/** Expandable patient summary for a booking on the doctor's agenda. */
export function PatientDetails({ appointment }: { appointment: Appointment }) {
  const [open, setOpen] = useState(false);
  const summaryQuery = usePatientSummary(appointment, open);

  return (
    <View className="gap-2">
      <Pressable
        accessibilityLabel={open ? "Hide patient details" : "Show patient details"}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        className="min-h-11 flex-row items-center justify-between web:hover:opacity-80"
        onPress={() => setOpen((value) => !value)}
      >
        <Text className="text-sm font-semibold text-primary">Patient details</Text>
        {open ? (
          <ChevronUp color={colors.primary} size={18} />
        ) : (
          <ChevronDown color={colors.primary} size={18} />
        )}
      </Pressable>
      {open ? (
        summaryQuery.data ? (
          <SummaryBody summary={summaryQuery.data} />
        ) : summaryQuery.isError ? (
          <Text className="text-sm text-danger">
            {summaryQuery.error instanceof SchedulingError
              ? summaryQuery.error.message
              : "Could not load patient details."}
          </Text>
        ) : (
          <ActivityIndicator color={colors.primary} />
        )
      ) : null}
    </View>
  );
}
