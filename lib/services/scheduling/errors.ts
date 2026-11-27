export type SchedulingErrorCode =
  /** The session filled up, ended or was cancelled before the booking landed. */
  | "SESSION_UNAVAILABLE"
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
