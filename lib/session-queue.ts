import { parseISO } from "date-fns";

import { visitStage } from "@/lib/visit-status-label";
import type { Appointment, VisitStage } from "@/types/scheduling";

/** A session's live bookings, split the way the doctor works through them. */
export interface QueueSections<V> {
  /** Called in, not finished (normally one). */
  withDoctor: V[];
  /** Checked in, in arrival order. */
  waiting: V[];
  /** Booked, not here yet (booking order). */
  notArrived: V[];
  /** Seen or no-show, most recent first. */
  done: V[];
}

type QueueVisit = Pick<
  Appointment,
  "id" | "status" | "checkedInAt" | "calledAt" | "queueNumber" | "finishedAt"
>;

/** Splits live (non-cancelled) bookings into queue sections. */
export function buildQueueSections<V extends QueueVisit>(visits: V[]): QueueSections<V> {
  const sections: QueueSections<V> = { withDoctor: [], waiting: [], notArrived: [], done: [] };
  for (const visit of visits) {
    const stage = visitStage(visit);
    if (stage === "with-doctor") sections.withDoctor.push(visit);
    else if (stage === "waiting") sections.waiting.push(visit);
    else if (stage === "booked") sections.notArrived.push(visit);
    else if (stage === "seen" || stage === "no-show") sections.done.push(visit);
  }
  sections.waiting.sort((left, right) => (left.queueNumber ?? 0) - (right.queueNumber ?? 0));
  sections.withDoctor.sort((left, right) => (left.calledAt ?? "").localeCompare(right.calledAt ?? ""));
  sections.done.sort((left, right) => (right.finishedAt ?? "").localeCompare(left.finishedAt ?? ""));
  return sections;
}

export type QueueActionId =
  | "arrive"
  | "call"
  | "complete"
  | "no_show"
  | "requeue"
  | "follow_up"
  | "cancel";

export interface SessionClock {
  startsAt: string;
  endsAt: string;
  /** Minutes before the start that check-in opens (hospital setting). */
  checkInOpensMinutes: number;
}

/**
 * Which actions staff can take for a booking at this stage and time. Mirrors
 * the checks in advance_visit / check_in_visit, so buttons that would only
 * fail aren't offered.
 */
export function queueActions(
  stage: VisitStage,
  clock: SessionClock,
  now: Date = new Date(),
): QueueActionId[] {
  const start = parseISO(clock.startsAt).getTime();
  const end = parseISO(clock.endsAt).getTime();
  const t = now.getTime();
  const checkInOpen = t >= start - clock.checkInOpensMinutes * 60_000 && t < end;
  const started = t >= start;

  switch (stage) {
    case "booked":
      return [
        ...(checkInOpen ? (["arrive"] as const) : []),
        ...(started ? (["no_show"] as const) : []),
        "cancel",
      ];
    case "waiting":
      return ["call", "complete", "no_show"];
    case "with-doctor":
      return ["complete", "requeue"];
    case "seen":
    case "no-show":
      return ["follow_up"];
    default:
      return [];
  }
}
