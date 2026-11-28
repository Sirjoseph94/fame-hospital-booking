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

const FIELD_LABELS: Record<string, string> = {
  name: "name",
  about: "description",
  phone: "phone",
  emergency_phone: "emergency phone",
  email: "email",
  address: "address",
  opening_hours: "opening hours",
  website: "website",
  time_zone: "time zone",
  booking_window_days: "booking window",
  check_in_opens_minutes: "check-in opening time",
  reminders_enabled: "reminders",
  reminder_evening_hour: "evening reminder time",
  reminder_morning_hour: "morning reminder time",
  auto_no_show: "automatic no-shows",
  no_show_after_minutes: "no-show grace period",
  waitlist_enabled: "waitlist",
};

function changedFields(metadata: Record<string, unknown>): string {
  const fields = Array.isArray(metadata.fields) ? (metadata.fields as unknown[]) : [];
  const labels = fields
    .filter((field): field is string => typeof field === "string")
    .map((field) => FIELD_LABELS[field] ?? field.replace(/_/g, " "));
  return labels.length > 0 ? ` (${labels.join(", ")})` : "";
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
    case "hospital_info_updated":
      return `Updated hospital information${changedFields(entry.metadata)}`;
    case "hospital_settings_updated":
      return `Changed settings${changedFields(entry.metadata)}`;
    case "check_in_code_rotated":
      return "Issued a new check-in code";
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
