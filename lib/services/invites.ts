import { supabase } from "@/lib/supabase";
import { defaultInviteExpiryIso } from "@/lib/validation/invites";

export type DoctorInviteStatus =
  | "pending"
  | "accepted"
  | "revoked"
  | "expired";

export class InviteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InviteError";
  }
}

export interface DoctorInvite {
  id: string;
  code: string;
  email: string;
  specialty: string;
  department: string | null;
  bio: string | null;
  consultationFee: number;
  yearsExperience: number;
  status: DoctorInviteStatus;
  expiresAt: string;
  createdAt: string;
}

export interface CreateDoctorInviteInput {
  email: string;
  specialty: string;
  department?: string;
  bio?: string;
  consultationFee?: number;
  yearsExperience?: number;
  expiresAt?: string;
}

interface DoctorInviteRow {
  id: string;
  code: string;
  email: string;
  specialty: string;
  department: string | null;
  bio: string | null;
  consultation_fee: number | null;
  years_experience: number | null;
  status: DoctorInviteStatus;
  expires_at: string;
  created_at: string;
}

const INVITE_CODE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const INVITE_CODE_LENGTH = 8;
const MAX_CODE_ATTEMPTS = 8;

function asInviteError(error: unknown): never {
  const message =
    error instanceof Error ? error.message : "Invite request failed.";
  throw new InviteError(message);
}

function mapInvite(row: DoctorInviteRow): DoctorInvite {
  return {
    id: row.id,
    code: row.code,
    email: row.email,
    specialty: row.specialty,
    department: row.department,
    bio: row.bio,
    consultationFee: Number(row.consultation_fee ?? 0),
    yearsExperience: Number(row.years_experience ?? 0),
    status: row.status,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}

/**
 * Status as an admin should see it: a pending invite past its expiry is
 * "expired" (the database only marks it when someone tries to claim it).
 */
export function effectiveInviteStatus(
  invite: Pick<DoctorInvite, "status" | "expiresAt">,
  now: Date = new Date(),
): DoctorInviteStatus {
  if (invite.status === "pending" && new Date(invite.expiresAt).getTime() <= now.getTime()) {
    return "expired";
  }
  return invite.status;
}

function generateInviteCode(): string {
  let code = "";
  for (let index = 0; index < INVITE_CODE_LENGTH; index += 1) {
    const charIndex = Math.floor(Math.random() * INVITE_CODE_CHARS.length);
    code += INVITE_CODE_CHARS[charIndex];
  }
  return code;
}

async function getCurrentUserId(): Promise<string> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    throw new InviteError("You must be signed in.");
  }
  return user.id;
}

async function assertAdmin(): Promise<string> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    asInviteError(error);
  }
  if (data?.role !== "admin") {
    throw new InviteError("Only administrators can manage doctor invites.");
  }
  return userId;
}

function isUniqueViolation(error: { code?: string } | null): boolean {
  return error?.code === "23505";
}

export const invitesService = {
  async createDoctorInvite(
    input: CreateDoctorInviteInput,
  ): Promise<DoctorInvite> {
    const createdBy = await assertAdmin();
    const expiresAt = input.expiresAt ?? defaultInviteExpiryIso(7);

    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
      const code = generateInviteCode();
      const { data, error } = await supabase
        .from("doctor_invites")
        .insert({
          code,
          email: input.email.trim(),
          specialty: input.specialty.trim(),
          department: input.department?.trim() || null,
          bio: input.bio?.trim() || null,
          consultation_fee: input.consultationFee ?? 0,
          years_experience: input.yearsExperience ?? 0,
          status: "pending",
          expires_at: expiresAt,
          created_by: createdBy,
        })
        .select(
          "id, code, email, specialty, department, bio, consultation_fee, years_experience, status, expires_at, created_at",
        )
        .single();

      if (!error && data) {
        return mapInvite(data as DoctorInviteRow);
      }
      if (!isUniqueViolation(error)) {
        asInviteError(error);
      }
    }

    throw new InviteError("Could not generate a unique invite code. Try again.");
  },

  /** Recent invites of every status, newest first. */
  async listDoctorInvites(): Promise<DoctorInvite[]> {
    await assertAdmin();

    const { data, error } = await supabase
      .from("doctor_invites")
      .select(
        "id, code, email, specialty, department, bio, consultation_fee, years_experience, status, expires_at, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      asInviteError(error);
    }

    return (data ?? []).map((row) => mapInvite(row as DoctorInviteRow));
  },

  async revokeDoctorInvite(inviteId: string): Promise<void> {
    await assertAdmin();

    const { data, error } = await supabase
      .from("doctor_invites")
      .update({ status: "revoked" })
      .eq("id", inviteId)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();

    if (error) {
      asInviteError(error);
    }
    if (!data) {
      throw new InviteError("Invite was not found or is no longer pending.");
    }
  },

  async claimDoctorInvite(code: string): Promise<string> {
    await getCurrentUserId();

    const { data, error } = await supabase.rpc("claim_doctor_invite", {
      p_code: code.trim(),
    });

    if (error) {
      asInviteError(error);
    }

    const payload = data as { success?: boolean; message?: string } | null;
    if (!payload?.success) {
      throw new InviteError(
        payload?.message ?? "Could not activate clinician access.",
      );
    }

    return payload.message ?? "Doctor profile activated successfully.";
  },
};
