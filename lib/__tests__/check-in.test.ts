import { checkInUrl, checkInWindow, formatCheckInCode } from "@/lib/check-in";
import { checkInCodeFromScan, normalizeCheckInCode } from "@/lib/services/scheduling/visit-flow";

// jest.mock is hoisted above the imports by babel-jest.
jest.mock("@/lib/supabase", () => ({ supabase: {} }));

describe("check-in codes", () => {
  it("builds the poster link and reads it back", () => {
    const url = checkInUrl("ABC234");
    expect(url).toBe("fame-hospital://check-in?code=ABC234");
    expect(checkInCodeFromScan(url)).toBe("ABC234");
  });

  it("accepts a bare code, any case, with spaces or dashes", () => {
    expect(checkInCodeFromScan(" abc 234 ")).toBe("ABC234");
    expect(normalizeCheckInCode("abc-234")).toBe("ABC234");
  });

  it("rejects things that aren't check-in codes", () => {
    expect(checkInCodeFromScan("https://example.com")).toBeNull();
    expect(checkInCodeFromScan("ABC12")).toBeNull();
    // 0, 1, O and I are never used.
    expect(checkInCodeFromScan("ABC120")).toBeNull();
  });

  it("formats codes in two groups", () => {
    expect(formatCheckInCode("ABC234")).toBe("ABC 234");
    expect(formatCheckInCode("AB")).toBe("AB");
  });
});

describe("checkInWindow", () => {
  const startsAt = "2026-11-30T09:00:00Z";
  const endsAt = "2026-11-30T12:00:00Z";

  it("opens the configured minutes before the start and closes at the end", () => {
    expect(checkInWindow(startsAt, endsAt, 120, new Date("2026-11-30T06:59:00Z"))).toBe("not-open");
    expect(checkInWindow(startsAt, endsAt, 120, new Date("2026-11-30T07:00:00Z"))).toBe("open");
    expect(checkInWindow(startsAt, endsAt, 120, new Date("2026-11-30T11:59:00Z"))).toBe("open");
    expect(checkInWindow(startsAt, endsAt, 120, new Date("2026-11-30T12:00:00Z"))).toBe("closed");
  });

  it("treats bad dates as closed", () => {
    expect(checkInWindow("nope", endsAt, 120)).toBe("closed");
  });
});

describe("time zones", () => {
  // Imported here to keep the module list at the top short.
  const { deviceClockDiffers, zoneOffsetMinutes } = jest.requireActual("@/lib/time-zone") as typeof import("@/lib/time-zone");

  it("reads a zone's UTC offset", () => {
    expect(zoneOffsetMinutes("Africa/Lagos", new Date("2026-11-30T12:00:00Z"))).toBe(60);
    expect(zoneOffsetMinutes("UTC", new Date("2026-11-30T12:00:00Z"))).toBe(0);
    expect(zoneOffsetMinutes("Not/AZone")).toBeNull();
  });

  it("compares with the device (tests run in UTC)", () => {
    expect(deviceClockDiffers("UTC")).toBe(false);
    expect(deviceClockDiffers("Africa/Lagos")).toBe(true);
    expect(deviceClockDiffers("Not/AZone")).toBe(false);
  });
});
