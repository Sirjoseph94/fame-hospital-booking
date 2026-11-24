import { focusManager, QueryClient } from "@tanstack/react-query";
import { AppState, Platform } from "react-native";

import { SchedulingError } from "@/lib/services/scheduling";

/** Only transient failures are worth retrying; permission/validation errors aren't. */
function isRetryable(error: unknown): boolean {
  if (error instanceof SchedulingError) {
    return error.code === "NETWORK_ERROR";
  }
  return true;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Scheduling data changes often (other patients book slots), so keep
      // this short; screens also refresh stale data when they regain focus.
      staleTime: 30_000,
      gcTime: 10 * 60_000,
      retry: (failureCount, error) => isRetryable(error) && failureCount < 2,
    },
    mutations: {
      retry: false,
    },
  },
});

// React Native has no window focus: refetch stale queries when the app
// comes back to the foreground instead.
if (Platform.OS !== "web") {
  AppState.addEventListener("change", (status) => {
    focusManager.setFocused(status === "active");
  });
}
