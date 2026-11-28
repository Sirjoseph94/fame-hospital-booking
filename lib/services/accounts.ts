import { supabase } from "@/lib/supabase";

export class AccountError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AccountError";
  }
}

function asAccountError(error: unknown): never {
  const message =
    error instanceof Error ? error.message : "Account request failed.";
  throw new AccountError(message);
}

async function getCurrentUserId(): Promise<string> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    throw new AccountError("You must be signed in.");
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
    asAccountError(error);
  }
  if (data?.role !== "admin") {
    throw new AccountError("Only administrators can manage accounts.");
  }
  return userId;
}

const deleteAccountMessages: Record<string, string> = {
  NOT_AUTHENTICATED: "Your session has expired. Sign in again, then retry.",
  STAFF_ACCOUNT:
    "Doctor and administrator accounts are managed by the hospital. Ask an administrator to remove your account.",
};

export const accountsService = {
  /**
   * Permanently deletes the signed-in patient's account and data
   * (delete_my_account RPC), then clears the local session. Upcoming visits
   * are cancelled first so their places reopen.
   */
  async deleteMyAccount(): Promise<{ cancelledVisits: number }> {
    const { data, error } = await supabase.rpc("delete_my_account");
    if (error) {
      asAccountError(error);
    }

    const result = (data ?? {}) as {
      success?: boolean;
      code?: string;
      cancelled_visits?: number;
    };
    if (!result.success) {
      throw new AccountError(
        deleteAccountMessages[result.code ?? ""] ??
          "Your account could not be deleted. Try again.",
      );
    }

    // The user no longer exists on the server; only clear this device.
    await supabase.auth.signOut({ scope: "local" });
    return { cancelledVisits: result.cancelled_visits ?? 0 };
  },

  async setProfileActive(
    targetUserId: string,
    isActive: boolean,
  ): Promise<void> {
    const adminId = await assertAdmin();
    if (targetUserId === adminId) {
      throw new AccountError("You cannot deactivate your own account.");
    }

    const { data: target, error: readError } = await supabase
      .from("profiles")
      .select("id, role")
      .eq("id", targetUserId)
      .maybeSingle();

    if (readError) {
      asAccountError(readError);
    }
    if (!target) {
      throw new AccountError("User profile not found.");
    }

    const { error: profileError } = await supabase
      .from("profiles")
      .update({ is_active: isActive })
      .eq("id", targetUserId);

    if (profileError) {
      asAccountError(profileError);
    }

    if (target.role === "doctor") {
      const { error: doctorError } = await supabase
        .from("doctors")
        .update({ is_active: isActive })
        .eq("id", targetUserId);

      if (doctorError) {
        asAccountError(doctorError);
      }
    }
  },
};
