import { isAfter, parseISO, subYears } from "date-fns";
import { z } from "zod";

import { isPastScheduleDate } from "@/lib/scheduling-dates";

export const calendarDateSchema = z
  .string()
  .min(1, "Select a date.")
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Select a date.")
  .refine(
    (value) => !Number.isNaN(parseISO(value).getTime()),
    "Select a valid date.",
  );

export const scheduleDateSchema = calendarDateSchema.refine(
  (value) => !isPastScheduleDate(value),
  "Choose today or a future date.",
);

export const dobDateSchema = calendarDateSchema
  .refine(
    (value) => !isAfter(parseISO(value), new Date()),
    "Date of birth cannot be in the future.",
  )
  .refine(
    (value) => isAfter(parseISO(value), subYears(new Date(), 120)),
    "Enter a realistic date of birth.",
  );

export const timeHmSchema = z
  .string()
  .min(1, "Select a time.")
  .regex(/^\d{2}:\d{2}$/, "Select a time.");

export const genderSchema = z.enum(["female", "male"], {
  message: "Select gender.",
});

export type GenderValue = z.infer<typeof genderSchema>;

export function parseTimeOnDate(dateYmd: string, timeHm: string): Date {
  return parseISO(`${dateYmd}T${timeHm}:00`);
}

export function toIsoDateTimeFromForm(dateYmd: string, timeHm: string): string {
  return parseTimeOnDate(dateYmd, timeHm).toISOString();
}

export const clinicSessionFormSchema = z
  .object({
    firstDate: scheduleDateSchema,
    startTime: timeHmSchema,
    endTime: timeHmSchema,
    capacity: z
      .string()
      .trim()
      .regex(/^\d+$/, "Enter a number of patients.")
      .refine((value) => {
        const count = Number.parseInt(value, 10);
        return count >= 1 && count <= 200;
      }, "Between 1 and 200 patients."),
    room: z.string().trim().max(40, "Keep the room under 40 characters."),
    repeatWeekly: z.boolean(),
    /** 0 = Sunday … 6 = Saturday; used when repeatWeekly is on. */
    weekdays: z.array(z.number().int().min(0).max(6)),
    weeks: z
      .string()
      .trim()
      .regex(/^\d+$/, "Enter a number of weeks.")
      .refine((value) => {
        const count = Number.parseInt(value, 10);
        return count >= 1 && count <= 26;
      }, "Between 1 and 26 weeks."),
  })
  .refine(
    (values) =>
      isAfter(
        parseTimeOnDate(values.firstDate, values.endTime),
        parseTimeOnDate(values.firstDate, values.startTime),
      ),
    { message: "End time must be after start time.", path: ["endTime"] },
  )
  .refine(
    (values) => {
      const start = parseTimeOnDate(values.firstDate, values.startTime);
      const end = parseTimeOnDate(values.firstDate, values.endTime);
      const minutes = (end.getTime() - start.getTime()) / 60_000;
      return minutes >= 30 && minutes <= 12 * 60;
    },
    {
      message: "A session must be between 30 minutes and 12 hours.",
      path: ["endTime"],
    },
  )
  .refine((values) => !values.repeatWeekly || values.weekdays.length > 0, {
    message: "Choose at least one day of the week.",
    path: ["weekdays"],
  });

export type ClinicSessionFormFields = z.infer<typeof clinicSessionFormSchema>;
