import { isBefore, parseISO, startOfDay } from "date-fns";

/** Local calendar start of today (for scheduling pickers and comparisons). */
export function scheduleMinimumDate(): Date {
  return startOfDay(new Date());
}

export function isPastScheduleDate(dateYmd: string): boolean {
  return isBefore(startOfDay(parseISO(dateYmd)), scheduleMinimumDate());
}

