import type { SchedulingErrorCode } from "@/lib/services/scheduling";

export function schedulingErrorRepickLabel(
  code: SchedulingErrorCode,
): string {
  if (code === "HOLD_EXPIRED") {
    return "Pick another slot";
  }
  if (code === "SLOT_TAKEN") {
    return "Choose a different time";
  }
  return "Go back";
}

export function schedulingErrorShowsRepick(code: SchedulingErrorCode): boolean {
  return code === "SLOT_TAKEN" || code === "HOLD_EXPIRED";
}

export function schedulingErrorShowsRetry(code: SchedulingErrorCode): boolean {
  return code === "NETWORK_ERROR";
}
