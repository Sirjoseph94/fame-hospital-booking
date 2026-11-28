import { buildCapacityRows } from "@/lib/admin-capacity";
import type { ClinicSession, Doctor } from "@/types/scheduling";

const doctor = (id: string, name: string): Doctor => ({
  id,
  name,
  department: "Outpatients",
  specialty: "GP",
  nextSession: null,
  isAcceptingBookings: true,
});

const session = (
  id: string,
  doctorId: string,
  startsAt: string,
  booked: number,
  capacity: number,
  status: ClinicSession["status"] = "scheduled",
): ClinicSession => ({
  id,
  doctorId,
  dateYmd: startsAt.slice(0, 10),
  startsAt,
  endsAt: startsAt.replace("T09", "T12").replace("T14", "T17"),
  capacity,
  bookedCount: booked,
  placesLeft: Math.max(capacity - booked, 0),
  status,
  isBookable: status === "scheduled" && booked < capacity,
  inBookingWindow: status === "scheduled",
  waitlistCount: 0,
});

describe("buildCapacityRows", () => {
  it("totals scheduled sessions per doctor and ignores cancelled ones in totals", () => {
    const rows = buildCapacityRows(
      [doctor("d1", "Dr. Ada")],
      [
        session("pm", "d1", "2026-11-24T14:00:00Z", 10, 10),
        session("am", "d1", "2026-11-24T09:00:00Z", 5, 20),
        session("x", "d1", "2026-11-24T09:00:00Z", 3, 20, "cancelled"),
      ],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ booked: 15, capacity: 30, bookedPercent: 50 });
    // Sessions in start order; the cancelled one is kept but flagged.
    expect(rows[0].sessions.map((s) => [s.sessionId, s.bookedPercent, s.cancelled])).toEqual([
      ["am", 25, false],
      ["x", 15, true],
      ["pm", 100, false],
    ]);
  });

  it("lists doctors with sessions first, then doctors without, by name", () => {
    const rows = buildCapacityRows(
      [doctor("d1", "Dr. Zed"), doctor("d2", "Dr. Ada"), doctor("d3", "Dr. Bea")],
      [session("s", "d1", "2026-11-24T09:00:00Z", 1, 10)],
    );
    expect(rows.map((row) => [row.doctorName, row.sessions.length])).toEqual([
      ["Dr. Zed", 1],
      ["Dr. Ada", 0],
      ["Dr. Bea", 0],
    ]);
    expect(rows[1]).toMatchObject({ booked: 0, capacity: 0, bookedPercent: 0 });
  });

  it("keeps sessions of doctors missing from the directory (e.g. inactive)", () => {
    const rows = buildCapacityRows([], [session("s", "gone", "2026-11-24T09:00:00Z", 2, 4)]);
    expect(rows[0]).toMatchObject({ doctorId: "gone", doctorName: "Doctor", bookedPercent: 50 });
  });
});
