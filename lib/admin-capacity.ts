import type { Doctor, Slot } from "@/types/scheduling";

export interface DoctorCapacityRow {
  doctorId: string;
  doctorName: string;
  booked: number;
  available: number;
  blackout: number;
  total: number;
  bookedPercent: number;
  availablePercent: number;
  blackoutPercent: number;
}

export function tallySlots(slots: Slot[]): Pick<
  DoctorCapacityRow,
  "booked" | "available" | "blackout" | "total"
> {
  let booked = 0;
  let available = 0;
  let blackout = 0;

  for (const slot of slots) {
    if (slot.status === "booked") {
      booked += 1;
    } else if (slot.status === "available") {
      available += 1;
    } else {
      blackout += 1;
    }
  }

  const total = booked + available + blackout;
  return { booked, available, blackout, total };
}

function percent(part: number, total: number): number {
  if (total === 0) {
    return 0;
  }
  return Math.round((part / total) * 100);
}

export function buildCapacityRow(doctor: Doctor, slots: Slot[]): DoctorCapacityRow {
  const counts = tallySlots(slots);
  return {
    doctorId: doctor.id,
    doctorName: doctor.name,
    ...counts,
    bookedPercent: percent(counts.booked, counts.total),
    availablePercent: percent(counts.available, counts.total),
    blackoutPercent: percent(counts.blackout, counts.total),
  };
}
