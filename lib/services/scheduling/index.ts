// Scheduling service (Supabase-backed). Callers import from
// "@/lib/services/scheduling"; each area lives in its own module here.

import { appointmentsMethods } from "./appointments";
import { beneficiariesMethods } from "./beneficiaries";
import { blackoutsMethods } from "./blackouts";
import { doctorsMethods } from "./doctors";
import { setNextFailure } from "./internal";
import { settingsMethods } from "./settings";
import { slotsMethods } from "./slots";
import type { SchedulingService } from "./types";

export const schedulingService: SchedulingService = {
  /** Dev-only fault injection (app/dev/kitchen-sink). Inert in production. */
  injectNextFailure: setNextFailure,
  ...beneficiariesMethods,
  ...doctorsMethods,
  ...slotsMethods,
  ...appointmentsMethods,
  ...blackoutsMethods,
  ...settingsMethods,
};

export { SchedulingError, type SchedulingErrorCode } from "./errors";
export type * from "./types";
export {
  appointmentEndsAt,
  isAppointmentUpcoming,
  isBeforeNow,
} from "./appointments";
export { toDbAppointmentStatus } from "./mappers";
