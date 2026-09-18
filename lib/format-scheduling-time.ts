import { format, isValid, parseISO } from "date-fns";

export function formatSchedulingTimeRange(
  startsAt: string,
  endsAt: string,
): string {
  const start = parseISO(startsAt);
  const end = parseISO(endsAt);
  if (!isValid(start) || !isValid(end)) {
    return "Time unavailable";
  }
  return `${format(start, "h:mm a")} – ${format(end, "h:mm a")}`;
}
