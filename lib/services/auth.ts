import type { Session as SupabaseSession } from "@supabase/supabase-js";
import * as Linking from "expo-linking";
import { Platform } from "react-native";

import { schedulingService } from "@/lib/services/scheduling";
import { supabase } from "@/lib/supabase";
import type { Role, Session } from "@/types/scheduling";

export function getPasswordResetRedirectUrl(): string {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    return `${window.location.origin}/reset-password`;
  }
  return Linking.createURL("reset-password");
}

interface ProfileRow {
  id: string;
  full_name: string;
  role: Role;
  is_active: boolean;
}

export interface SignUpInput {
  email: string;
  password: string;
  displayName: string;
  dob: string;
  gender: string;
}

export interface AuthService {
  getCurrentSession(): Promise<Session | null>;
  signIn(email: string, password: string): Promise<Session>;
  signUp(input: SignUpInput): Promise<Session | null>;
  requestPasswordReset(email: string): Promise<void>;
  updatePassword(password: string): Promise<void>;
  signOut(): Promise<void>;
  subscribe(listener: (session: Session | null) => void): () => void;
}

function isRole(value: unknown): value is Role {
  return value === "patient" || value === "doctor" || value === "admin";
}

function parseProfile(value: unknown): ProfileRow | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const profile = value as Record<string, unknown>;
  if (
    typeof profile.id !== "string" ||
    typeof profile.full_name !== "string" ||
    !isRole(profile.role) ||
    typeof profile.is_active !== "boolean"
  ) {
    return null;
  }

  return {
    id: profile.id,
    full_name: profile.full_name,
    role: profile.role,
    is_active: profile.is_active,
  };
}

async function resolveAppSession(
  authSession: SupabaseSession | null,
): Promise<Session | null> {
  if (!authSession) {
    return null;
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, role, is_active")
    .eq("id", authSession.user.id)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  const profile = parseProfile(data);
  if (!profile) {
    throw new Error("The authenticated user has no valid hospital profile.");
  }
  if (!profile.is_active) {
    await supabase.auth.signOut();
    throw new Error(
      "This account is inactive. Contact the hospital administrator.",
    );
  }

  return {
    userId: profile.id,
    role: profile.role,
    displayName: profile.full_name,
  };
}

export const authService: AuthService = {
  async getCurrentSession() {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();
    if (error) {
      throw new Error(error.message);
    }
    const appSession = await resolveAppSession(session);
    if (appSession?.role === "patient") {
      try {
        await schedulingService.ensureSelfBeneficiary(appSession.userId);
      } catch {
        // Patient can complete self setup on Home.
      }
    }
    return appSession;
  },

  async signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      throw new Error(error.message);
    }

    const session = await resolveAppSession(data.session);
    if (!session) {
      throw new Error("Supabase did not return an authenticated session.");
    }
    if (session.role === "patient") {
      try {
        await schedulingService.ensureSelfBeneficiary(session.userId);
      } catch {
        // Booking still works once the patient completes self setup on Home.
      }
    }
    return session;
  },

  async signUp({ email, password, displayName, dob, gender }) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          // Role is assigned server-side (always "patient" on sign-up).
          full_name: displayName,
          dob,
          gender,
        },
      },
    });
    if (error) {
      throw new Error(error.message);
    }

    const session = await resolveAppSession(data.session);
    if (session) {
      const { error: beneficiaryError } = await supabase
        .from("beneficiaries")
        .insert({
          account_holder_id: session.userId,
          display_name: displayName,
          relationship: "self",
          dob,
          gender,
        });
      // 23505: a "self" row already exists (e.g. created by the Home screen
      // first). One per account is enforced by the database, so that's fine.
      if (beneficiaryError && beneficiaryError.code !== "23505") {
        throw new Error(
          `Account created, but your patient profile could not be saved: ${beneficiaryError.message}`,
        );
      }
    }

    return session;
  },

  async requestPasswordReset(email) {
    const { error } = await supabase.auth.resetPasswordForEmail(
      email.trim(),
      { redirectTo: getPasswordResetRedirectUrl() },
    );
    if (error) {
      throw new Error(error.message);
    }
  },

  async updatePassword(password) {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      throw new Error(error.message);
    }
  },

  async signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) {
      throw new Error(error.message);
    }
  },

  subscribe(listener) {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      void resolveAppSession(session)
        .then(listener)
        .catch(() => listener(null));
    });
    return () => data.subscription.unsubscribe();
  },
};
