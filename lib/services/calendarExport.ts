// SDK 58: the function API moved to expo-calendar/legacy (the main entry
// keeps throwing stubs). Migrate to the object API (getCalendars,
// calendar.createEvent) when convenient.
import * as Calendar from "expo-calendar/legacy";

import { isNative, isWeb } from "@/lib/platform";
import type { AppointmentType } from "@/types/scheduling";

export interface CalendarExportInput {
  appointmentId: string;
  title: string;
  startsAt: string;
  durationMin: number;
  type: AppointmentType;
  room?: string;
  /** Extra line for the event description. */
  note?: string;
  /** From hospital_info (admin-managed). */
  hospitalName?: string;
  hospitalAddress?: string;
}

/** UTC "yyyyMMddTHHmmssZ" (the trailing Z means the time must be UTC). */
export function toIcsDate(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** RFC 5545 text escaping (backslash, semicolon, comma, newline). */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** "Room 4" for a bare number, otherwise the room as written ("Clinic B"). */
export function roomLabel(room: string): string {
  return /^\d/.test(room.trim()) ? `Room ${room.trim()}` : room.trim();
}

/** Event location: room, hospital name and address, whichever are known. */
export function eventLocation(input: CalendarExportInput): string {
  return [input.room ? roomLabel(input.room) : null, input.hospitalName, input.hospitalAddress]
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(", ");
}

export function buildIcsContent(input: CalendarExportInput, now = new Date()): string {
  const start = new Date(input.startsAt);
  const end = new Date(start.getTime() + input.durationMin * 60_000);
  const description = [input.note, `Appointment ID: ${input.appointmentId}`]
    .filter(Boolean)
    .join("\n");
  const location = eventLocation(input);

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//FAME Hospital Booking//EN",
    "BEGIN:VEVENT",
    `UID:${input.appointmentId}@fame-hospital-booking`,
    `DTSTAMP:${toIcsDate(now.toISOString())}`,
    `DTSTART:${toIcsDate(input.startsAt)}`,
    `DTEND:${toIcsDate(end.toISOString())}`,
    `SUMMARY:${escapeIcsText(input.title)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    location ? `LOCATION:${escapeIcsText(location)}` : null,
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n");
}

function downloadIcs(filename: string, contents: string): void {
  const blob = new Blob([contents], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function exportAppointmentToCalendar(
  input: CalendarExportInput,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (isWeb) {
    try {
      downloadIcs(`appointment-${input.appointmentId}.ics`, buildIcsContent(input));
      return { ok: true };
    } catch {
      return { ok: false, message: "Could not download the calendar file." };
    }
  }

  if (!isNative) {
    return { ok: false, message: "Calendar export is unavailable on this platform." };
  }

  try {
    const permission = await Calendar.requestCalendarPermissionsAsync();
    if (!permission.granted) {
      return {
        ok: false,
        message:
          "Calendar access is off. Allow it in Settings, or add the visit to your calendar yourself.",
      };
    }

    const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
    const target =
      calendars.find((calendar) => calendar.isPrimary && calendar.allowsModifications) ??
      calendars.find((calendar) => calendar.allowsModifications);
    if (!target) {
      return { ok: false, message: "No calendar on this device accepts new events." };
    }

    const startDate = new Date(input.startsAt);
    const endDate = new Date(startDate.getTime() + input.durationMin * 60_000);

    await Calendar.createEventAsync(target.id, {
      title: input.title,
      startDate,
      endDate,
      notes: [input.note, `Appointment ID: ${input.appointmentId}`].filter(Boolean).join("\n"),
      location: eventLocation(input) || undefined,
    });
    return { ok: true };
  } catch {
    return { ok: false, message: "Could not add the visit to your calendar." };
  }
}
