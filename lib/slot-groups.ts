import { format, parseISO } from "date-fns";

import type { Slot } from "@/types/scheduling";

export interface SlotDateSection {
  dateKey: string;
  title: string;
  slots: Slot[];
}

export function groupSlotsByDate(slots: Slot[]): SlotDateSection[] {
  const byDate = new Map<string, Slot[]>();

  for (const slot of slots) {
    const dateKey = format(parseISO(slot.startsAt), "yyyy-MM-dd");
    const bucket = byDate.get(dateKey);
    if (bucket) {
      bucket.push(slot);
    } else {
      byDate.set(dateKey, [slot]);
    }
  }

  return [...byDate.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([dateKey, daySlots]) => ({
      dateKey,
      title: format(parseISO(`${dateKey}T12:00:00`), "EEEE, MMM d"),
      slots: [...daySlots].sort(
        (left, right) =>
          parseISO(left.startsAt).getTime() - parseISO(right.startsAt).getTime(),
      ),
    }));
}
