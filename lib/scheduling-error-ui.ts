import type { SchedulingErrorCode } from "@/lib/services/scheduling";

export function schedulingErrorRepickLabel(
  code: SchedulingErrorCode,
): string {
  if (code === "SESSION_UNAVAILABLE") {
    return "Choose another session";
  }
  return "Go back";
}

export function schedulingErrorShowsRepick(code: SchedulingErrorCode): boolean {
  return code === "SESSION_UNAVAILABLE";
}

export function schedulingErrorShowsRetry(code: SchedulingErrorCode): boolean {
  return code === "NETWORK_ERROR";
}
