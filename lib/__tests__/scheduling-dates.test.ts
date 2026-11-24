import {
  assertScheduleDateNotInPast,
  assertScheduleInstantNotInPast,
  isPastScheduleDate,
  todayYmdLocal,
} from "@/lib/scheduling-dates";

describe("scheduling dates", () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date("2026-11-24T10:00:00Z"));
  });
  afterEach(() => jest.useRealTimers());

  it("formats today as yyyy-MM-dd", () => {
    expect(todayYmdLocal()).toBe("2026-11-24");
  });

  it("treats only earlier calendar days as past", () => {
    expect(isPastScheduleDate("2026-11-23")).toBe(true);
    expect(isPastScheduleDate("2026-11-24")).toBe(false);
    expect(isPastScheduleDate("2026-11-25")).toBe(false);
  });

  it("rejects past dates and instants", () => {
    expect(() => assertScheduleDateNotInPast("2026-11-23")).toThrow("Choose today or a future date.");
    expect(() => assertScheduleDateNotInPast("2026-11-24")).not.toThrow();
    expect(() => assertScheduleInstantNotInPast("2026-11-24T09:59:00Z")).toThrow("Cannot schedule in the past.");
    expect(() => assertScheduleInstantNotInPast(new Date("2026-11-24T10:01:00Z"))).not.toThrow();
  });
});
