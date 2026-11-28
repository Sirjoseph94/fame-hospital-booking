import { useQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query/keys";
import { auditService } from "@/lib/services/audit";

/** Admin: recent audit log entries. */
export function useAuditLog() {
  return useQuery({
    queryKey: queryKeys.auditLog,
    queryFn: () => auditService.listAuditLog(),
  });
}
