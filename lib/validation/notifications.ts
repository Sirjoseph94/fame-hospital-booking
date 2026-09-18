import { z } from "zod";

export const notificationPreferencesSchema = z.object({
  emailOptIn: z.boolean(),
  smsOptIn: z.boolean(),
  pushOptIn: z.boolean(),
});

export type NotificationPreferencesFields = z.infer<
  typeof notificationPreferencesSchema
>;
