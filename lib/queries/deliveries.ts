import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query/keys";
import { deliveriesService } from "@/lib/services/deliveries";

/** Admin: failed email / SMS / push messages. */
export function useFailedDeliveries() {
  return useQuery({
    queryKey: queryKeys.failedDeliveries,
    queryFn: () => deliveriesService.listFailed(),
  });
}

export function useRetryDelivery() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (deliveryId: string) => deliveriesService.retry(deliveryId),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.failedDeliveries }),
  });
}
