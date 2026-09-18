import { format, isBefore, parseISO, startOfDay } from "date-fns";

/** Local calendar start of today (for scheduling pickers and comparisons). */
export function scheduleMinimumDate(): Date {
  return startOfDay(new Date());
}

export function todayYmdLocal(): string {
  return format(scheduleMinimumDate(), "yyyy-MM-dd");
}

export function isPastScheduleDate(dateYmd: string): boolean {
  return isBefore(startOfDay(parseISO(dateYmd)), scheduleMinimumDate());
}

export function assertScheduleDateNotInPast(dateYmd: string): void {
  if (isPastScheduleDate(dateYmd)) {
    throw new Error("Choose today or a future date.");
  }
}

export function assertScheduleInstantNotInPast(isoOrDate: string | Date): void {
  const instant =
    typeof isoOrDate === "string" ? parseISO(isoOrDate) : isoOrDate;
  if (instant.getTime() < Date.now()) {
    throw new Error("Cannot schedule in the past.");
  }
}
