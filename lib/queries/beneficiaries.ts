import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query/keys";
import {
  schedulingService,
  type CreateBeneficiaryInput,
} from "@/lib/services/scheduling";

export function useBeneficiaries(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.beneficiaries(userId ?? ""),
    queryFn: () => schedulingService.listBeneficiaries(userId!),
    enabled: Boolean(userId),
  });
}

export function useCreateBeneficiary() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateBeneficiaryInput) =>
      schedulingService.createBeneficiary(input),
    onSettled: (_data, _error, input) =>
      queryClient.invalidateQueries({
        queryKey: queryKeys.beneficiaries(input.accountHolderId),
      }),
  });
}

/** Creates the account holder's "self" beneficiary when missing. */
export function useEnsureSelfBeneficiary() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (accountHolderId: string) =>
      schedulingService.ensureSelfBeneficiary(accountHolderId),
    onSettled: (_data, _error, accountHolderId) =>
      queryClient.invalidateQueries({
        queryKey: queryKeys.beneficiaries(accountHolderId),
      }),
  });
}
