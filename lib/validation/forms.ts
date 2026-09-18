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

export const bufferMinutesSchema = z
  .number()
  .int("Use a whole number.")
  .min(0, "Buffer cannot be negative.")
  .max(120, "Buffer cannot exceed 120 minutes.");

export function parseTimeOnDate(dateYmd: string, timeHm: string): Date {
  return parseISO(`${dateYmd}T${timeHm}:00`);
}

export function toIsoDateTimeFromForm(dateYmd: string, timeHm: string): string {
  return parseTimeOnDate(dateYmd, timeHm).toISOString();
}

export const blackoutFormSchema = z
  .object({
    slotDate: scheduleDateSchema,
    startTime: timeHmSchema,
    endTime: timeHmSchema,
    reason: z.string().trim().min(3, "Add a short reason."),
  })
  .refine(
    (values) =>
      isAfter(
        parseTimeOnDate(values.slotDate, values.endTime),
        parseTimeOnDate(values.slotDate, values.startTime),
      ),
    { message: "End time must be after start time.", path: ["endTime"] },
  )
  .refine(
    (values) =>
      parseTimeOnDate(values.slotDate, values.startTime).getTime() >=
      Date.now(),
    {
      message: "Blackout cannot start in the past.",
      path: ["startTime"],
    },
  );

export type BlackoutFormFields = z.infer<typeof blackoutFormSchema>;

export const availabilitySlotFormSchema = z
  .object({
    slotDate: scheduleDateSchema,
    startTime: timeHmSchema,
    endTime: timeHmSchema,
  })
  .refine(
    (values) =>
      isAfter(
        parseTimeOnDate(values.slotDate, values.endTime),
        parseTimeOnDate(values.slotDate, values.startTime),
      ),
    { message: "End time must be after start time.", path: ["endTime"] },
  )
  .refine(
    (values) => {
      const start = parseTimeOnDate(values.slotDate, values.startTime);
      const end = parseTimeOnDate(values.slotDate, values.endTime);
      const minutes = (end.getTime() - start.getTime()) / 60_000;
      return minutes >= 15 && minutes <= 240;
    },
    {
      message: "Each open slot must be between 15 minutes and 4 hours.",
      path: ["endTime"],
    },
  )
  .refine(
    (values) =>
      parseTimeOnDate(values.slotDate, values.startTime).getTime() >=
      Date.now(),
    {
      message: "Start time must be in the future.",
      path: ["startTime"],
    },
  );

export type AvailabilitySlotFormFields = z.infer<
  typeof availabilitySlotFormSchema
>;
