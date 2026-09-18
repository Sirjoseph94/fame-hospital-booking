import { addMinutes, format, isSameDay, isValid, parseISO } from "date-fns";

import { todayYmdLocal } from "@/lib/scheduling-dates";

import type {
  Appointment,
  BeneficiaryRelationship,
} from "@/types/scheduling";

export interface DoctorAgendaVisit extends Appointment {
  startsAt: string;
  endsAt: string;
  beneficiaryName: string;
  accountHolderName: string;
  relationship: BeneficiaryRelationship;
  proxyTag?: string;
}

export type DoctorAgendaTimelineItem =
  | { kind: "visit"; visit: DoctorAgendaVisit }
  | {
      kind: "buffer";
      startsAt: string;
      endsAt: string;
      minutes: number;
    };

export function doctorProxyTag(
  accountHolderName: string,
  relationship: BeneficiaryRelationship,
): string | undefined {
  if (relationship === "self") {
    return undefined;
  }
  return `Booked by ${accountHolderName} [${relationship}]`;
}

export function filterVisitsForDay(
  visits: DoctorAgendaVisit[],
  day: Date,
): DoctorAgendaVisit[] {
  return visits.filter((visit) => isSameDay(parseISO(visit.startsAt), day));
}

/** Confirmed visits on today or an earlier calendar day can be marked complete. */
export function canDoctorMarkVisitComplete(startsAt: string): boolean {
  const visitYmd = format(parseISO(startsAt), "yyyy-MM-dd");
  return visitYmd <= todayYmdLocal();
}

export function buildDoctorAgendaTimeline(
  visits: DoctorAgendaVisit[],
  bufferMinutes: number,
): DoctorAgendaTimelineItem[] {
  const sorted = [...visits].sort(
    (left, right) =>
      parseISO(left.startsAt).getTime() - parseISO(right.startsAt).getTime(),
  );

  const items: DoctorAgendaTimelineItem[] = [];

  for (const visit of sorted) {
    items.push({ kind: "visit", visit });

    if (bufferMinutes <= 0 || visit.status === "cancelled") {
      continue;
    }

    const visitEnd = parseISO(visit.endsAt);
    if (!isValid(visitEnd)) {
      continue;
    }

    const bufferStart = visit.endsAt;
    const bufferEnd = addMinutes(visitEnd, bufferMinutes).toISOString();

    items.push({
      kind: "buffer",
      startsAt: bufferStart,
      endsAt: bufferEnd,
      minutes: bufferMinutes,
    });
  }

  return items;
}

export function formatAgendaDayLabel(day: Date): string {
  return format(day, "EEEE, MMM d");
}
