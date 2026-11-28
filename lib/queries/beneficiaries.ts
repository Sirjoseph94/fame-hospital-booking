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

export function useUpdateBeneficiary(accountHolderId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      beneficiaryId: string;
      changes: Parameters<typeof schedulingService.updateBeneficiary>[1];
    }) => schedulingService.updateBeneficiary(input.beneficiaryId, input.changes),
    onSettled: () =>
      queryClient.invalidateQueries({
        queryKey: queryKeys.beneficiaries(accountHolderId ?? ""),
      }),
  });
}

export function useRemoveBeneficiary(accountHolderId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (beneficiaryId: string) => schedulingService.removeBeneficiary(beneficiaryId),
    onSettled: () =>
      queryClient.invalidateQueries({
        queryKey: queryKeys.beneficiaries(accountHolderId ?? ""),
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
