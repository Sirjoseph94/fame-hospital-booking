import { z } from "zod";

const optionalShort = z.string().trim().max(200).optional().or(z.literal(""));

const optionalLong = z.string().trim().max(2000).optional().or(z.literal(""));

export const patientProfileSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your full name."),
  phone: optionalShort,
  emergencyContactName: optionalShort,
  emergencyContactPhone: optionalShort,
  address: optionalLong,
  bloodType: optionalShort,
  allergies: optionalLong,
  medications: optionalLong,
  medicalConditions: optionalLong,
  medicalNotes: optionalLong,
});

export type PatientProfileFormFields = z.infer<typeof patientProfileSchema>;

export const doctorProfileSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your full name."),
  phone: optionalShort,
  specialty: z.string().trim().min(2, "Enter your specialty."),
  bio: optionalLong,
  yearsExperience: z
    .string()
    .trim()
    .regex(/^\d+$/, "Use a whole number.")
    .transform((value) => parseInt(value, 10))
    .pipe(
      z
        .number()
        .int()
        .min(0, "Cannot be negative.")
        .max(60, "Enter a realistic value."),
    ),
  consultationFee: z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,2})?$/, "Enter a valid amount.")
    .transform((value) => parseFloat(value))
    .pipe(z.number().min(0, "Cannot be negative.")),
});

