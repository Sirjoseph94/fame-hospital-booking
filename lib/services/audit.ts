import { supabase } from "@/lib/supabase";

export interface AuditEntry {
  id: string;
  action: string;
  targetType: string;
  targetId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  actorName: string;
  /** Name of the affected account, for profile actions. */
  targetName?: string;
}

interface AuditRow {
  id: string;
  action: string;
  target_type: string;
  target_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  actor: { full_name?: string } | { full_name?: string }[] | null;
}

export class AuditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuditError";
  }
}

function nameOf(actor: AuditRow["actor"]): string {
  const row = Array.isArray(actor) ? actor[0] : actor;
  return row?.full_name?.trim() || "Former admin";
}

/** Plain-English line for an audit entry. */
export function describeAuditEntry(entry: AuditEntry): string {
  const email = typeof entry.metadata.email === "string" ? entry.metadata.email : null;
  const specialty =
    typeof entry.metadata.specialty === "string" ? entry.metadata.specialty : null;
  const who = entry.targetName ?? "an account";
  switch (entry.action) {
    case "doctor_invite_created":
      return `Created a doctor invite for ${email ?? "a clinician"}${specialty ? ` (${specialty})` : ""}`;
    case "doctor_invite_revoked":
      return `Revoked the doctor invite for ${email ?? "a clinician"}`;
    case "profile_deactivated":
      return `Deactivated ${who}`;
    case "profile_reactivated":
      return `Reactivated ${who}`;
    default:
      return entry.action.replace(/_/g, " ");
  }
}

export const auditService = {
  /** Admin: most recent audit entries, newest first. RLS limits reads to admins. */
  async listAuditLog(limit = 100): Promise<AuditEntry[]> {
    const { data, error } = await supabase
      .from("admin_audit_log")
      .select("id, action, target_type, target_id, metadata, created_at, actor:profiles(full_name)")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      throw new AuditError(error.message || "Could not load the activity log.");
    }

    const rows = (data ?? []) as AuditRow[];
    const profileIds = [
      ...new Set(
        rows
          .filter((row) => row.target_type === "profile" && row.target_id)
          .map((row) => row.target_id as string),
      ),
    ];
    const names = new Map<string, string>();
    if (profileIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", profileIds);
      for (const profile of (profiles ?? []) as { id: string; full_name: string }[]) {
        names.set(profile.id, profile.full_name);
      }
    }

    return rows.map((row) => ({
      id: row.id,
      action: row.action,
      targetType: row.target_type,
      targetId: row.target_id,
      metadata: row.metadata ?? {},
      createdAt: row.created_at,
      actorName: nameOf(row.actor),
      targetName: row.target_id ? names.get(row.target_id) : undefined,
    }));
  },
};
