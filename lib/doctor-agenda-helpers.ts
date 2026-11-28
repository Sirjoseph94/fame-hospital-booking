import { format, isSameDay, parseISO } from "date-fns";

import type {
  Appointment,
  BeneficiaryRelationship,
  ClinicSession,
} from "@/types/scheduling";

export interface DoctorAgendaVisit extends Appointment {
  startsAt: string;
  endsAt: string;
  beneficiaryName: string;
  accountHolderName: string;
  relationship: BeneficiaryRelationship;
  proxyTag?: string;
}

/** One session on the agenda with the patients booked into it. */
export interface AgendaSessionGroup {
  /** Null for older bookings that aren't attached to a session. */
  session: ClinicSession | null;
  /** Live bookings in booking order (the order they were made). */
  visits: DoctorAgendaVisit[];
  cancelled: DoctorAgendaVisit[];
}

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

/**
 * Groups a day's visits under that day's sessions, in session order. Visits
 * keep the order they arrive in (the service returns them in booking order).
 * Sessions with no bookings are kept so the doctor sees every session.
 */
export function groupVisitsBySession(
  visits: DoctorAgendaVisit[],
  sessions: ClinicSession[],
): AgendaSessionGroup[] {
  const sortedSessions = [...sessions].sort(
    (left, right) =>
      parseISO(left.startsAt).getTime() - parseISO(right.startsAt).getTime(),
  );
  const groups = new Map<string, AgendaSessionGroup>();
  for (const session of sortedSessions) {
    groups.set(session.id, { session, visits: [], cancelled: [] });
  }
  const unattached: AgendaSessionGroup = { session: null, visits: [], cancelled: [] };

  for (const visit of visits) {
    const group = (visit.sessionId && groups.get(visit.sessionId)) || unattached;
    if (visit.status === "cancelled") {
      group.cancelled.push(visit);
    } else {
      group.visits.push(visit);
    }
  }

  const result = [...groups.values()];
  if (unattached.visits.length > 0 || unattached.cancelled.length > 0) {
    result.push(unattached);
  }
  return result;
}

export function formatAgendaDayLabel(day: Date): string {
  return format(day, "EEEE, MMM d");
}
