import { useQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query/keys";
import { updatesService } from "@/lib/services/updates";

/** The patient's recent booking updates (the messages we sent them). */
export function useMyUpdates(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.updates(userId ?? ""),
    queryFn: () => updatesService.listMyUpdates(userId!),
    enabled: Boolean(userId),
  });
}
