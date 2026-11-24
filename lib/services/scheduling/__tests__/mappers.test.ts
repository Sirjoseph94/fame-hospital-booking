import {
  applyBufferToSlots,
  mapDoctor,
  mapDoctorDetail,
  slotStartsAt,
  type DoctorRow,
} from "@/lib/services/scheduling/mappers";
import type { Slot } from "@/types/scheduling";

const row = (overrides: Partial<DoctorRow> = {}): DoctorRow => ({
  id: "d1",
  specialty: "GP",
  department: "Outpatients",
  is_accepting_bookings: true,
  is_active: true,
  profile: { full_name: "Dr. Ada", is_active: true },
  ...overrides,
});

describe("slotStartsAt", () => {
  it("accepts HH:mm and HH:mm:ss start times", () => {
    expect(slotStartsAt({ slot_date: "2026-11-24", start_time: "09:30" })).toBe("2026-11-24T09:30:00.000Z");
    expect(slotStartsAt({ slot_date: "2026-11-24", start_time: "09:30:00" })).toBe("2026-11-24T09:30:00.000Z");
  });
});

describe("applyBufferToSlots", () => {
  const slot = (id: string, startsAt: string, status: Slot["status"] = "available"): Slot => ({ id, doctorId: "d1", startsAt, durationMin: 30, status });
  const slots = [
    slot("during-buffer", "2026-11-24T09:30:00.000Z"),
    slot("after-buffer", "2026-11-24T09:45:00.000Z"),
    slot("booked", "2026-11-24T09:00:00.000Z", "booked"),
  ];

  it("blocks available slots that start inside the post-visit buffer", () => {
    const result = applyBufferToSlots(slots, ["2026-11-24T09:30:00.000Z"], 15);
    expect(result.map((s) => [s.id, s.status])).toEqual([
      ["during-buffer", "blackout"],
      ["after-buffer", "available"],
      ["booked", "booked"],
    ]);
  });

  it("is a no-op with no buffer or no bookings", () => {
    expect(applyBufferToSlots(slots, ["2026-11-24T09:30:00.000Z"], 0)).toBe(slots);
    expect(applyBufferToSlots(slots, [], 15)).toBe(slots);
  });
});

describe("doctor mappers", () => {
  it("keeps the raw booking flag separate from activation (DoctorDetail)", () => {
    expect(mapDoctorDetail(row({ is_active: false }))).toMatchObject({ acceptingBookingsFlag: true, isActive: false, name: "Dr. Ada" });
    expect(mapDoctorDetail(row({ profile: { full_name: "Dr. Ada", is_active: false } }))).toMatchObject({ isActive: false });
    expect(mapDoctorDetail(row({ profile: [{ full_name: "Dr. Array", is_active: true }] }))).toMatchObject({ name: "Dr. Array", isActive: true });
  });

  it("passes through a null next-available time (no open slots)", () => {
    expect(mapDoctor(row(), null).nextAvailable).toBeNull();
    expect(mapDoctor(row({ is_accepting_bookings: false }), null).isAcceptingBookings).toBe(false);
  });
});
