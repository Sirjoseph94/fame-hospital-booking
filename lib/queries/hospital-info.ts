import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { DEFAULT_HOSPITAL_INFO, type HospitalInfo } from "@/lib/hospital-info";
import { queryKeys } from "@/lib/query/keys";
import { hospitalInfoService } from "@/lib/services/hospital-info";

/**
 * Hospital contact details. Shows the built-in defaults while loading or
 * offline (`placeholderData`), so screens never wait on it.
 */
export function useHospitalInfo() {
  return useQuery({
    queryKey: queryKeys.hospitalInfo,
    queryFn: () => hospitalInfoService.get(),
    staleTime: 10 * 60_000,
    placeholderData: DEFAULT_HOSPITAL_INFO,
  });
}

export function useUpdateHospitalInfo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (info: Omit<HospitalInfo, "updatedAt">) => hospitalInfoService.update(info),
    onSuccess: (info) => {
      queryClient.setQueryData(queryKeys.hospitalInfo, info);
      void queryClient.invalidateQueries({ queryKey: queryKeys.auditLog });
    },
  });
}
