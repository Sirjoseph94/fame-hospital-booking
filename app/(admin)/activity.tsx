import { useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { format, parseISO } from "date-fns";

import { FailedMessagesCard } from "@/components/admin/failed-messages-card";
import { ShellHeader } from "@/components/shell-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { RefreshErrorNotice } from "@/components/ui/refresh-error-notice";
import { SchedulingStatePanel } from "@/components/ui/scheduling-state-panel";
import { ScreenLoadingSkeleton, VisitListSkeleton } from "@/components/ui/skeleton";
import { useAdminBack } from "@/lib/hooks/use-admin-back";
import { useAuditLog } from "@/lib/queries/audit";
import { useFailedDeliveries } from "@/lib/queries/deliveries";
import { queryKeys } from "@/lib/query/keys";
import { useRefreshOnFocus } from "@/lib/query/use-refresh-on-focus";
import { describeAuditEntry } from "@/lib/services/audit";

function errorText(cause: unknown): string {
  return cause instanceof Error ? cause.message : "Could not load the activity log.";
}

/** Admin: failed messages, and who changed what (invites, accounts, settings). */
export default function AdminActivityScreen() {
  const auditQuery = useAuditLog();
  const failedQuery = useFailedDeliveries();
  const [userRefreshing, setUserRefreshing] = useState(false);
  const onBack = useAdminBack();
  useRefreshOnFocus([queryKeys.auditLog, queryKeys.failedDeliveries]);

  const entries = auditQuery.data;

  const refresh = async () => {
    setUserRefreshing(true);
    try {
      await Promise.all([auditQuery.refetch(), failedQuery.refetch()]);
    } finally {
      setUserRefreshing(false);
    }
  };

  return (
    <View className="flex-1 bg-surface-muted">
      <ShellHeader onBack={onBack} title="Activity" />
      {auditQuery.isPending ? (
        <ScreenLoadingSkeleton>
          <VisitListSkeleton count={4} />
        </ScreenLoadingSkeleton>
      ) : auditQuery.isError && !entries ? (
        <View className="flex-1 justify-center px-4">
          <SchedulingStatePanel
            message={errorText(auditQuery.error)}
            onRetry={() => void auditQuery.refetch()}
          />
        </View>
      ) : (
        <ScrollView
          contentContainerClassName="gap-3 px-4 pb-8 pt-2"
          contentInsetAdjustmentBehavior="automatic"
          refreshControl={
            <RefreshControl refreshing={userRefreshing} onRefresh={() => void refresh()} />
          }
        >
          <RefreshErrorNotice
            message={auditQuery.isError ? errorText(auditQuery.error) : null}
          />
          <FailedMessagesCard />
          <Text accessibilityRole="header" className="pt-2 text-base font-semibold text-ink">
            Admin changes
          </Text>
          <Text className="text-sm text-ink-muted">
            Changes made by administrators: doctor invites, account activation,
            hospital details and settings. Latest 100.
          </Text>
          {!entries || entries.length === 0 ? (
            <EmptyState message="No admin activity yet." />
          ) : (
            entries.map((entry) => (
              <Card key={entry.id} style={{ gap: 4 }}>
                <Text className="text-base text-ink" selectable>
                  {describeAuditEntry(entry)}
                </Text>
                <Text className="text-xs text-ink-muted">
                  {entry.actorName} · {format(parseISO(entry.createdAt), "MMM d, yyyy · h:mm a")}
                </Text>
              </Card>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}
