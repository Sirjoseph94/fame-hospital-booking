import { describeAuditEntry, type AuditEntry } from "@/lib/services/audit";
import { effectiveInviteStatus } from "@/lib/services/invites";

// The services import the Supabase client; only pure helpers are tested here.
jest.mock("@/lib/supabase", () => ({ supabase: {} }));

describe("effectiveInviteStatus", () => {
  const now = new Date("2026-11-28T12:00:00Z");
  it("shows pending invites past their expiry as expired", () => {
    expect(effectiveInviteStatus({ status: "pending", expiresAt: "2026-11-28T11:59:00Z" }, now)).toBe("expired");
    expect(effectiveInviteStatus({ status: "pending", expiresAt: "2026-11-29T00:00:00Z" }, now)).toBe("pending");
  });
  it("leaves final statuses alone", () => {
    expect(effectiveInviteStatus({ status: "accepted", expiresAt: "2026-11-01T00:00:00Z" }, now)).toBe("accepted");
    expect(effectiveInviteStatus({ status: "revoked", expiresAt: "2026-12-01T00:00:00Z" }, now)).toBe("revoked");
  });
});

describe("describeAuditEntry", () => {
  const entry = (action: string, metadata: Record<string, unknown> = {}, targetName?: string): AuditEntry => ({
    id: "1",
    action,
    targetType: action.startsWith("profile") ? "profile" : "doctor_invite",
    targetId: "t",
    metadata,
    createdAt: "2026-11-28T12:00:00Z",
    actorName: "Admin",
    targetName,
  });

  it("words each known action", () => {
    expect(describeAuditEntry(entry("doctor_invite_created", { email: "d@x.test", specialty: "GP" }))).toBe(
      "Created a doctor invite for d@x.test (GP)",
    );
    expect(describeAuditEntry(entry("doctor_invite_revoked", { email: "d@x.test" }))).toBe(
      "Revoked the doctor invite for d@x.test",
    );
    expect(describeAuditEntry(entry("profile_deactivated", {}, "Dr. Ada"))).toBe("Deactivated Dr. Ada");
    expect(describeAuditEntry(entry("profile_reactivated"))).toBe("Reactivated an account");
  });

  it("falls back to the raw action name", () => {
    expect(describeAuditEntry(entry("something_new"))).toBe("something new");
  });
});
