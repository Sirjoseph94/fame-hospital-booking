import {
  formatSessionTimes,
  formatSessionWhen,
  groupSessionsByDate,
  placesLeftLabel,
} from "@/lib/session-groups";
import type { ClinicSession } from "@/types/scheduling";

// TZ=UTC in tests.
const session = (id: string, dateYmd: string, start: string, end: string): ClinicSession => ({
  id,
  doctorId: "d1",
  dateYmd,
  startsAt: `${dateYmd}T${start}:00.000Z`,
  endsAt: `${dateYmd}T${end}:00.000Z`,
  capacity: 10,
  bookedCount: 0,
  placesLeft: 10,
  status: "scheduled",
  isBookable: true,
  inBookingWindow: true,
  waitlistCount: 0,
});

describe("groupSessionsByDate", () => {
  it("groups by date with dates and times in order", () => {
    const sections = groupSessionsByDate([
      session("tue-pm", "2026-12-01", "14:00", "17:00"),
      session("mon", "2026-11-30", "09:00", "12:00"),
      session("tue-am", "2026-12-01", "09:00", "12:00"),
    ]);
    expect(sections.map((s) => [s.dateKey, s.title, s.sessions.map((x) => x.id)])).toEqual([
      ["2026-11-30", "Monday, Nov 30", ["mon"]],
      ["2026-12-01", "Tuesday, Dec 1", ["tue-am", "tue-pm"]],
    ]);
  });

  it("returns nothing for no sessions", () => {
    expect(groupSessionsByDate([])).toEqual([]);
  });
});

describe("session labels", () => {
  it("formats times and dates", () => {
    const s = session("x", "2026-12-01", "09:00", "13:30");
    expect(formatSessionTimes(s)).toBe("9:00 AM – 1:30 PM");
    expect(formatSessionWhen(s)).toBe("Tue, Dec 1 · 9:00 AM – 1:30 PM");
  });

  it("words places left", () => {
    expect(placesLeftLabel(0)).toBe("Full");
    expect(placesLeftLabel(-2)).toBe("Full");
    expect(placesLeftLabel(1)).toBe("1 place left");
    expect(placesLeftLabel(12)).toBe("12 places left");
  });
});
