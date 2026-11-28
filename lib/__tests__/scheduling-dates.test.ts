import { isPastScheduleDate } from "@/lib/scheduling-dates";

describe("scheduling dates", () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date("2026-11-24T10:00:00Z"));
  });
  afterEach(() => jest.useRealTimers());

  it("treats only earlier calendar days as past", () => {
    expect(isPastScheduleDate("2026-11-23")).toBe(true);
    expect(isPastScheduleDate("2026-11-24")).toBe(false);
    expect(isPastScheduleDate("2026-11-25")).toBe(false);
  });
});
