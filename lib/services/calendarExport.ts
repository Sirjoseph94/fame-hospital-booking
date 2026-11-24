// SDK 58: the function API moved to expo-calendar/legacy (the main entry
// keeps throwing stubs). Migrate to the object API (getCalendars,
// calendar.createEvent) when convenient.
import * as Calendar from "expo-calendar/legacy";
import { format } from "date-fns";

import { isNative, isWeb } from "@/lib/platform";
import { hospitalInfo } from "@/lib/hospital-info";
import type { AppointmentType } from "@/types/scheduling";

export interface CalendarExportInput {
  appointmentId: string;
  title: string;
  startsAt: string;
  durationMin: number;
  type: AppointmentType;
  room?: string;
}

function toIcsDate(iso: string): string {
  return `${format(new Date(iso), "yyyyMMdd'T'HHmmss")}Z`;
}

function buildIcsContent(input: CalendarExportInput): string {
  const start = new Date(input.startsAt);
  const end = new Date(start.getTime() + input.durationMin * 60_000);
  const description = [
    `Appointment ID: ${input.appointmentId}`,
    `Visit type: ${input.type}`,
    input.room ? `Room: ${input.room}` : null,
    hospitalInfo.about,
  ]
    .filter(Boolean)
    .join("\\n");

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//FAME Hospital Booking//EN",
    "BEGIN:VEVENT",
    `UID:${input.appointmentId}@famehospital.example`,
    `DTSTAMP:${toIcsDate(new Date().toISOString())}`,
    `DTSTART:${toIcsDate(input.startsAt)}`,
    `DTEND:${toIcsDate(end.toISOString())}`,
    `SUMMARY:${input.title}`,
    `DESCRIPTION:${description}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
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

  const permission = await Calendar.requestCalendarPermissionsAsync();
  if (!permission.granted) {
    return {
      ok: false,
      message: "Calendar permission denied. Use the appointment details to add the visit manually.",
    };
  }

  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const target =
    calendars.find((calendar) => calendar.isPrimary) ?? calendars[0];
  if (!target) {
    return {
      ok: false,
      message: "No writable calendar found on this device.",
    };
  }

  const startDate = new Date(input.startsAt);
  const endDate = new Date(startDate.getTime() + input.durationMin * 60_000);

  await Calendar.createEventAsync(target.id, {
    title: input.title,
    startDate,
    endDate,
    notes: `Appointment ID: ${input.appointmentId}`,
    location: input.room ? `Room ${input.room}` : hospitalInfo.name,
  });

  return { ok: true };
}
