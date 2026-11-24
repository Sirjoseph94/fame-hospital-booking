import { buildCapacityRow, tallySlots } from "@/lib/admin-capacity";
import type { Doctor, Slot } from "@/types/scheduling";

const slot = (status: Slot["status"], i: number): Slot => ({
  id: `s${i}`,
  doctorId: "d1",
  startsAt: `2026-11-24T0${i}:00:00Z`,
  durationMin: 30,
  status,
});
const doctor: Doctor = {
  id: "d1",
  name: "Dr. Ada",
  department: "Outpatients",
  specialty: "GP",
  nextAvailable: null,
  isAcceptingBookings: true,
};

describe("admin capacity", () => {
  it("tallies held/blocked slots as unavailable (blackout bucket)", () => {
    const slots = [slot("booked", 1), slot("available", 2), slot("available", 3), slot("held", 4), slot("blackout", 5)];
    expect(tallySlots(slots)).toEqual({ booked: 1, available: 2, blackout: 2, total: 5 });
  });

  it("computes rounded percentages and handles an empty day", () => {
    const row = buildCapacityRow(doctor, [slot("booked", 1), slot("available", 2), slot("available", 3)]);
    expect(row).toMatchObject({ doctorName: "Dr. Ada", bookedPercent: 33, availablePercent: 67, blackoutPercent: 0 });
    expect(buildCapacityRow(doctor, [])).toMatchObject({ total: 0, bookedPercent: 0, availablePercent: 0 });
  });
});
