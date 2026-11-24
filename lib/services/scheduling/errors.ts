export type SchedulingErrorCode =
  | "SLOT_TAKEN"
  | "HOLD_EXPIRED"
  | "NETWORK_ERROR"
  /** Caller is not allowed to perform the action (retrying won't help). */
  | "FORBIDDEN"
  /** Request is invalid for the current state (retrying won't help). */
  | "INVALID_REQUEST";

export class SchedulingError extends Error {
  constructor(
    public readonly code: SchedulingErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "SchedulingError";
  }
}
