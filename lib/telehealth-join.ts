import { addMinutes, differenceInMinutes, parseISO } from "date-fns";

const joinWindowMinutes = 15;
/** Keep the link available a little past the scheduled end for overruns. */
const lateJoinGraceMinutes = 15;
/** Used to close the window when a visit has no recorded end time. */
const fallbackVisitMinutes = 60;

export function telehealthJoinState(
  startsAt: string,
  endsAt: string | undefined,
  now: Date = new Date(),
): { showJoin: boolean; label: string } {
  const start = parseISO(startsAt);
  const end = endsAt ? parseISO(endsAt) : addMinutes(start, fallbackVisitMinutes);
  const minutesUntil = differenceInMinutes(start, now);

  if (minutesUntil > joinWindowMinutes) {
    return { showJoin: false, label: "" };
  }

  if (now > addMinutes(end, lateJoinGraceMinutes)) {
    return { showJoin: false, label: "" };
  }

  if (minutesUntil <= 0) {
    return { showJoin: true, label: "Join visit" };
  }

  return {
    showJoin: true,
    label: `Join in ${minutesUntil} min`,
  };
}
