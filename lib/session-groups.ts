import { format, parseISO } from "date-fns";

import type { ClinicSession } from "@/types/scheduling";

export interface SessionDateSection {
  dateKey: string;
  title: string;
  sessions: ClinicSession[];
}

/** Sessions grouped by local date, dates and sessions in time order. */
export function groupSessionsByDate(sessions: ClinicSession[]): SessionDateSection[] {
  const byDate = new Map<string, ClinicSession[]>();
  for (const session of sessions) {
    const bucket = byDate.get(session.dateYmd);
    if (bucket) {
      bucket.push(session);
    } else {
      byDate.set(session.dateYmd, [session]);
    }
  }

  return [...byDate.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([dateKey, daySessions]) => ({
      dateKey,
      title: format(parseISO(`${dateKey}T12:00:00`), "EEEE, MMM d"),
      sessions: [...daySessions].sort(
        (left, right) =>
          parseISO(left.startsAt).getTime() - parseISO(right.startsAt).getTime(),
      ),
    }));
}

/** "9:00 AM – 12:00 PM". */
export function formatSessionTimes(session: Pick<ClinicSession, "startsAt" | "endsAt">): string {
  return `${format(parseISO(session.startsAt), "h:mm a")} – ${format(parseISO(session.endsAt), "h:mm a")}`;
}

/** "Mon, Dec 1 · 9:00 AM – 12:00 PM". */
export function formatSessionWhen(session: Pick<ClinicSession, "startsAt" | "endsAt">): string {
  return `${format(parseISO(session.startsAt), "EEE, MMM d")} · ${formatSessionTimes(session)}`;
}

/** "12 places left" / "1 place left" / "Full". */
export function placesLeftLabel(placesLeft: number): string {
  if (placesLeft <= 0) {
    return "Full";
  }
  return placesLeft === 1 ? "1 place left" : `${placesLeft} places left`;
}
