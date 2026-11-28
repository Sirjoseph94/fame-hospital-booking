import { addDays } from "date-fns";
import { z } from "zod";

export const doctorInviteFormSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Enter the doctor's email address.")
    .email("Enter a valid email address."),
  specialty: z.string().trim().min(2, "Enter a specialty."),
  department: z.string().trim().max(80, "Keep the department under 80 characters.").optional(),
  bio: z.string().trim().optional(),
  consultationFee: z
    .string()
    .trim()
    .optional()
    .refine(
      (value) =>
        !value ||
        (!Number.isNaN(Number.parseFloat(value)) &&
          Number.parseFloat(value) >= 0),
      "Fee must be zero or more.",
    ),
  yearsExperience: z
    .string()
    .trim()
    .optional()
    .refine(
      (value) =>
        !value ||
        (Number.isInteger(Number.parseInt(value, 10)) &&
          Number.parseInt(value, 10) >= 0),
      "Use a whole number of years.",
    ),
  expiryDays: z
    .string()
    .trim()
    .min(1, "Enter expiry in days.")
    .refine(
      (value) => {
        const days = Number.parseInt(value, 10);
        return Number.isInteger(days) && days >= 1 && days <= 90;
      },
      "Expiry must be between 1 and 90 days.",
    ),
});


export const doctorClaimCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, "Enter your invite code.")
    .transform((value) => value.toUpperCase())
    .refine(
      (value) => /^[A-Z0-9]{8}$/.test(value),
      "Invite codes are 8 letters or numbers.",
    ),
});

export type DoctorClaimCodeFields = z.infer<typeof doctorClaimCodeSchema>;

export function defaultInviteExpiryIso(daysFromNow = 7): string {
  return addDays(new Date(), daysFromNow).toISOString();
}
