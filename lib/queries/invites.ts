import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query/keys";
import {
  invitesService,
  type CreateDoctorInviteInput,
} from "@/lib/services/invites";

/** Admin: recent doctor invites (all statuses). */
export function useDoctorInvites(enabled = true) {
  return useQuery({
    queryKey: queryKeys.invites,
    queryFn: () => invitesService.listDoctorInvites(),
    enabled,
  });
}

export function useCreateDoctorInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateDoctorInviteInput) =>
      invitesService.createDoctorInvite(input),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.invites }),
  });
}

export function useRevokeDoctorInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (inviteId: string) => invitesService.revokeDoctorInvite(inviteId),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.invites }),
  });
}

/** Patient → doctor upgrade via invite code. Caller refreshes the session. */
export function useClaimDoctorInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => invitesService.claimDoctorInvite(code),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.doctors.all }),
  });
}
