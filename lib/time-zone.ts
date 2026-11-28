/**
 * Minutes ahead of UTC for an IANA zone at a moment (e.g. Africa/Lagos → 60),
 * or null if the zone isn't known to this device.
 */
export function zoneOffsetMinutes(timeZone: string, date: Date = new Date()): number | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(date);
    const get = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find((part) => part.type === type)?.value);
    const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
    const offset = Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60_000);
    return Number.isFinite(offset) ? offset : null;
  } catch {
    return null;
  }
}

/**
 * Session times are hospital wall-clock times shown on the device's clock.
 * True when the device is on a different UTC offset than the hospital right
 * now (an unknown zone counts as matching: nothing useful to warn about).
 */
export function deviceClockDiffers(hospitalTimeZone: string, date: Date = new Date()): boolean {
  const hospital = zoneOffsetMinutes(hospitalTimeZone, date);
  return hospital !== null && hospital !== -date.getTimezoneOffset();
}
