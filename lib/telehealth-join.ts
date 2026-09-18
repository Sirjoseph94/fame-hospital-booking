import { differenceInMinutes, parseISO } from "date-fns";

const joinWindowMinutes = 15;

export function telehealthJoinState(
  startsAt: string,
  now: Date = new Date(),
): { showJoin: boolean; label: string } {
  const minutesUntil = differenceInMinutes(parseISO(startsAt), now);

  if (minutesUntil > joinWindowMinutes) {
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
