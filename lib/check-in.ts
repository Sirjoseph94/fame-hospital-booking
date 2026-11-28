import { isValid, parseISO } from "date-fns";

/** App URL scheme (app.json "scheme"). */
export const APP_SCHEME = "fame-hospital";

/** What the reception QR poster encodes: opens the app's check-in screen. */
export function checkInUrl(code: string): string {
  return `${APP_SCHEME}://check-in?code=${encodeURIComponent(code)}`;
}

/** Shows the code in two groups for reading aloud / typing: "ABC 123". */
export function formatCheckInCode(code: string): string {
  return code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code;
}

/**
 * Whether check-in is open for a session right now (opens `opensMinutes`
 * before the start, closes at the end). Mirrors check_in_visit.
 */
export function checkInWindow(
  startsAt: string,
  endsAt: string,
  opensMinutes: number,
  now: Date = new Date(),
): "not-open" | "open" | "closed" {
  const start = parseISO(startsAt);
  const end = parseISO(endsAt);
  if (!isValid(start) || !isValid(end)) {
    return "closed";
  }
  if (now.getTime() >= end.getTime()) {
    return "closed";
  }
  if (now.getTime() < start.getTime() - opensMinutes * 60_000) {
    return "not-open";
  }
  return "open";
}

/** Printable A4 poster for reception (used with expo-print). */
export function checkInPosterHtml(options: {
  hospitalName: string;
  code: string;
  qrSvg: string;
}): string {
  const escape = (value: string) =>
    value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
  return `<!doctype html><html><head><meta charset="utf-8"><title>Check-in · ${escape(options.hospitalName)}</title>
<style>
  @page { size: A4; margin: 18mm; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #0F172A; text-align: center; }
  h1 { font-size: 34px; margin: 12px 0 4px; }
  h2 { font-size: 22px; font-weight: 600; color: #475569; margin: 0 0 28px; }
  .qr { display: inline-block; padding: 12px; border: 2px solid #0F172A; border-radius: 16px; }
  .code { font-size: 44px; letter-spacing: 8px; font-weight: 800; margin: 22px 0 4px; }
  ol { text-align: left; display: inline-block; font-size: 20px; line-height: 1.6; margin-top: 24px; }
  .small { font-size: 14px; color: #64748B; margin-top: 28px; }
</style></head><body>
  <h1>${escape(options.hospitalName)}</h1>
  <h2>Check in for your clinic visit</h2>
  <div class="qr">${options.qrSvg}</div>
  <div class="code">${escape(formatCheckInCode(options.code))}</div>
  <div>Check-in code</div>
  <ol>
    <li>Open the ${escape(options.hospitalName)} app and go to My Visits.</li>
    <li>Tap <b>Check in</b> on today's visit.</li>
    <li>Scan this code, or type the code above.</li>
  </ol>
  <div class="small">Patients are seen in order of arrival. No phone? Ask at the reception desk.</div>
</body></html>`;
}
