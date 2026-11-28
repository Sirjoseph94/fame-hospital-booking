// Scheduling service (Supabase-backed). Callers import from
// "@/lib/services/scheduling"; each area lives in its own module here.

import { appointmentsMethods } from "./appointments";
import { beneficiariesMethods } from "./beneficiaries";
import { doctorsMethods } from "./doctors";
import { setNextFailure } from "./internal";
import { sessionsMethods } from "./sessions";
import type { SchedulingService } from "./types";

export const schedulingService: SchedulingService = {
  /** Dev-only fault injection (app/dev/kitchen-sink). Inert in production. */
  injectNextFailure: setNextFailure,
  ...beneficiariesMethods,
  ...doctorsMethods,
  ...sessionsMethods,
  ...appointmentsMethods,
};

export { SchedulingError, type SchedulingErrorCode } from "./errors";
export type * from "./types";
export {
  visitFlowService,
  checkInCodeFromScan,
  normalizeCheckInCode,
  type CheckInResult,
  type VisitAction,
} from "./visit-flow";
