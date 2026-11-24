import { useCallback, useRef } from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useFocusEffect } from "expo-router";

/**
 * Tabs and stack screens stay mounted when you navigate away, so React
 * Query's window-focus refetch never fires for them. Refetch the given
 * queries when the screen regains focus, but only if they're stale (and not
 * on the first focus, when the queries have just loaded).
 */
export function useRefreshOnFocus(queryKeys: readonly QueryKey[]): void {
  const queryClient = useQueryClient();
  const firstFocus = useRef(true);
  const keysJson = JSON.stringify(queryKeys);

  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      for (const queryKey of JSON.parse(keysJson) as QueryKey[]) {
        void queryClient.refetchQueries({ queryKey, stale: true, type: "active" });
      }
    }, [queryClient, keysJson]),
  );
}
