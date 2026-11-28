import { supabase } from "@/lib/supabase";

import {
  APPOINTMENT_SELECT,
} from "@/lib/services/scheduling/internal";
import {
  mapAppointment,
  mapBeneficiary,
  type AppointmentRow,
  type BeneficiaryRow,
} from "@/lib/services/scheduling/mappers";
import type { Appointment, Beneficiary } from "@/types/scheduling";

export interface PatientListItem {
  id: string;
  fullName: string;
  phone?: string;
  isActive: boolean;
  /** Missing for profiles without a created_at (the column is nullable). */
  createdAt?: string;
}

export interface PatientRecord extends PatientListItem {
  address?: string;
  emergencyContact?: string;
  /** Family members, including removed ones (flagged `archived`). */
  beneficiaries: Beneficiary[];
  /** Every booking on the account, newest first. */
  appointments: Appointment[];
}

interface ProfileRow {
  id: string;
  full_name: string;
  phone: string | null;
  is_active: boolean;
  created_at: string | null;
  address?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
}

export class PatientsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PatientsError";
  }
}

function mapListItem(row: ProfileRow): PatientListItem {
  return {
    id: row.id,
    fullName: row.full_name,
    phone: row.phone?.trim() || undefined,
    isActive: row.is_active,
    createdAt: row.created_at ?? undefined,
  };
}

/** Escape a user search term for a PostgREST ilike pattern inside or(). */
export function toIlikePattern(term: string): string {
  const cleaned = term.trim().replace(/[%_\\]/g, (char) => `\\${char}`).replace(/[,()]/g, " ");
  return `%${cleaned}%`;
}

const PROFILE_LIST_COLUMNS = "id, full_name, phone, is_active, created_at";

export const patientsService = {
  /**
   * Admin: patients matching a name, phone or hospital file number. Empty
   * search lists the newest patients. RLS lets admins read every profile.
   */
  async search(term: string, limit = 50): Promise<PatientListItem[]> {
    const trimmed = term.trim();
    let query = supabase
      .from("profiles")
      .select(PROFILE_LIST_COLUMNS)
      .eq("role", "patient")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (trimmed) {
      const pattern = toIlikePattern(trimmed);
      // Family members' hospital file numbers point back to the account.
      const { data: fileMatches, error: fileError } = await supabase
        .from("beneficiaries")
        .select("account_holder_id")
        .ilike("hospital_file_id", pattern)
        .limit(limit);
      if (fileError) {
        throw new PatientsError(fileError.message);
      }
      const holderIds = [
        ...new Set((fileMatches ?? []).map((row) => row.account_holder_id as string)),
      ];
      const filters = [`full_name.ilike.${pattern}`, `phone.ilike.${pattern}`];
      if (holderIds.length > 0) {
        filters.push(`id.in.(${holderIds.join(",")})`);
      }
      query = query.or(filters.join(","));
    }

    const { data, error } = await query;
    if (error) {
      throw new PatientsError(error.message || "Could not search patients.");
    }
    return ((data ?? []) as ProfileRow[]).map(mapListItem);
  },

  /** Admin: one patient's profile, family members and bookings. */
  async get(patientId: string): Promise<PatientRecord> {
    const [profileResult, beneficiariesResult, appointmentsResult] = await Promise.all([
      supabase
        .from("profiles")
        .select(
          `${PROFILE_LIST_COLUMNS}, address, emergency_contact_name, emergency_contact_phone`,
        )
        .eq("id", patientId)
        .maybeSingle(),
      supabase.from("beneficiaries").select("*").eq("account_holder_id", patientId),
      supabase
        .from("appointments")
        .select(APPOINTMENT_SELECT)
        .or(`account_holder_id.eq.${patientId},patient_id.eq.${patientId}`)
        .order("appointment_date", { ascending: false })
        .order("start_time", { ascending: false })
        .limit(100),
    ]);

    const failure =
      profileResult.error ?? beneficiariesResult.error ?? appointmentsResult.error;
    if (failure) {
      throw new PatientsError(failure.message || "Could not load the patient.");
    }
    if (!profileResult.data) {
      throw new PatientsError("Patient not found.");
    }

    const profile = profileResult.data as ProfileRow;
    const emergency = [profile.emergency_contact_name, profile.emergency_contact_phone]
      .map((value) => value?.trim())
      .filter(Boolean)
      .join(" · ");

    return {
      ...mapListItem(profile),
      address: profile.address?.trim() || undefined,
      emergencyContact: emergency || undefined,
      beneficiaries: ((beneficiariesResult.data ?? []) as BeneficiaryRow[]).map(mapBeneficiary),
      appointments: ((appointmentsResult.data ?? []) as AppointmentRow[]).map(mapAppointment),
    };
  },
};
