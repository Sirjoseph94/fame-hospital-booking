function readSchedulingLatencyMs(): number {
  const raw = process.env.EXPO_PUBLIC_SCHEDULING_LATENCY_MS;
  if (raw === undefined || raw.trim() === "") {
    return __DEV__ ? 550 : 0;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return __DEV__ ? 550 : 0;
  }
  return parsed;
}

export const schedulingLatencyMs = readSchedulingLatencyMs();
export const holdDurationMs = 5 * 60 * 1000;
export const holdDurationSeconds = holdDurationMs / 1000;
