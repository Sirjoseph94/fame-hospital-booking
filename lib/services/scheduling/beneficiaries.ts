// Beneficiaries: the people an account holder books for (self, children, …).

import { supabase } from "@/lib/supabase";

import { SchedulingError } from "./errors";
import {
  asNetworkError,
  consumeFailure,
  getCurrentUserId,
  wait,
} from "./internal";
import { type BeneficiaryRow, mapBeneficiary } from "./mappers";
import type { SchedulingService } from "./types";

export const beneficiariesMethods: Pick<
  SchedulingService,
  "listBeneficiaries" | "ensureSelfBeneficiary" | "createBeneficiary"
> = {
  async listBeneficiaries(accountHolderId) {
    await wait();
    consumeFailure("NETWORK_ERROR");

    try {
      const { data, error } = await supabase
        .from("beneficiaries")
        .select("*")
        .eq("account_holder_id", accountHolderId)
        .order("relationship", { ascending: true });

      if (error) {
        asNetworkError(error);
      }

      return ((data ?? []) as BeneficiaryRow[]).map(mapBeneficiary);
    } catch (error) {
      if (error instanceof SchedulingError) {
        throw error;
      }
      asNetworkError(error);
    }
  },
  async ensureSelfBeneficiary(accountHolderId) {
    await wait();
    consumeFailure("NETWORK_ERROR");

    try {
      const existing = await beneficiariesMethods.listBeneficiaries(accountHolderId);
      const self = existing.find((row) => row.relationship === "self");
      if (self) {
        return self;
      }

      const userId = await getCurrentUserId();
      if (userId !== accountHolderId) {
        return null;
      }

      const [{ data: profile, error: profileError }, { data: authData }] =
        await Promise.all([
          supabase
            .from("profiles")
            .select("full_name")
            .eq("id", accountHolderId)
            .single(),
          supabase.auth.getUser(),
        ]);

      if (profileError) {
        asNetworkError(profileError);
      }

      const metadata = authData.user?.user_metadata ?? {};
      const dob =
        typeof metadata.dob === "string" && metadata.dob.trim()
          ? metadata.dob.trim()
          : undefined;
      const gender =
        typeof metadata.gender === "string" && metadata.gender.trim()
          ? metadata.gender.trim()
          : undefined;

      if (!dob || !gender) {
        return null;
      }

      const displayName =
        profile?.full_name?.trim() ||
        (typeof metadata.full_name === "string"
          ? metadata.full_name.trim()
          : "") ||
        "Patient";

      try {
        return await beneficiariesMethods.createBeneficiary({
          accountHolderId,
          displayName,
          relationship: "self",
          dob,
          gender,
        });
      } catch (error) {
        // Lost a race with sign-up (or another tab) creating the same row:
        // the database allows one "self" per account, so return that one.
        if (
          error instanceof SchedulingError &&
          error.code === "INVALID_REQUEST"
        ) {
          const latest =
            await beneficiariesMethods.listBeneficiaries(accountHolderId);
          const created = latest.find((row) => row.relationship === "self");
          if (created) {
            return created;
          }
        }
        throw error;
      }
    } catch (error) {
      if (error instanceof SchedulingError) {
        throw error;
      }
      asNetworkError(error);
    }
  },
  async createBeneficiary(input) {
    await wait();
    consumeFailure("NETWORK_ERROR");

    try {
      const userId = await getCurrentUserId();
      if (userId !== input.accountHolderId) {
        throw new SchedulingError(
          "FORBIDDEN",
          "You can only add beneficiaries to your own account.",
        );
      }

      if (input.relationship === "self") {
        const { data: existingSelf, error: selfError } = await supabase
          .from("beneficiaries")
          .select("id")
          .eq("account_holder_id", input.accountHolderId)
          .eq("relationship", "self")
          .maybeSingle();

        if (selfError) {
          asNetworkError(selfError);
        }
        if (existingSelf) {
          throw new SchedulingError(
            "INVALID_REQUEST",
            "Your self patient profile already exists.",
          );
        }
      }

      const { data, error } = await supabase
        .from("beneficiaries")
        .insert({
          account_holder_id: input.accountHolderId,
          display_name: input.displayName,
          relationship: input.relationship,
          dob: input.dob,
          gender: input.gender,
          national_id: input.nationalId ?? null,
          hospital_file_id: input.hospitalFileId ?? null,
        })
        .select("*")
        .single();

      if (error?.code === "23505" && input.relationship === "self") {
        throw new SchedulingError(
          "INVALID_REQUEST",
          "Your self patient profile already exists.",
        );
      }
      if (error || !data) {
        asNetworkError(error ?? new Error("Beneficiary could not be saved."));
      }

      return mapBeneficiary(data as BeneficiaryRow);
    } catch (error) {
      if (error instanceof SchedulingError) {
        throw error;
      }
      asNetworkError(error);
    }
  },
};
