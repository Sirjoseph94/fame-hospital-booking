import { supabase } from "@/lib/supabase";
import type {
  DoctorProfile,
  PatientProfile,
  UpdateDoctorProfileInput,
  UpdatePatientProfileInput,
} from "@/types/profile";

interface ProfileRow {
  id: string;
  full_name: string;
  phone: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  address: string | null;
  blood_type: string | null;
  allergies: string | null;
  medications: string | null;
  medical_conditions: string | null;
  medical_notes: string | null;
}

interface DoctorRow {
  id: string;
  specialty: string;
  department: string;
  bio: string | null;
  years_experience: number | null;
  consultation_fee: number | null;
}

function optionalText(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function mapPatient(row: ProfileRow, email: string): PatientProfile {
  return {
    userId: row.id,
    fullName: row.full_name,
    email,
    phone: optionalText(row.phone),
    emergencyContactName: optionalText(row.emergency_contact_name),
    emergencyContactPhone: optionalText(row.emergency_contact_phone),
    address: optionalText(row.address),
    bloodType: optionalText(row.blood_type),
    allergies: optionalText(row.allergies),
    medications: optionalText(row.medications),
    medicalConditions: optionalText(row.medical_conditions),
    medicalNotes: optionalText(row.medical_notes),
  };
}

async function authEmail(): Promise<string> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user?.email) {
    throw new Error("Could not load your account email.");
  }
  return user.email;
}

export const profileService = {
  async getPatientProfile(userId: string): Promise<PatientProfile> {
    const [email, { data, error }] = await Promise.all([
      authEmail(),
      supabase.from("profiles").select("*").eq("id", userId).single(),
    ]);

    if (error || !data) {
      throw new Error(error?.message ?? "Profile could not be loaded.");
    }

    return mapPatient(data as ProfileRow, email);
  },

  async updatePatientProfile(
    userId: string,
    input: UpdatePatientProfileInput,
  ): Promise<PatientProfile> {
    const { data, error } = await supabase
      .from("profiles")
      .update({
        full_name: input.fullName.trim(),
        phone: input.phone?.trim() || null,
        emergency_contact_name: input.emergencyContactName?.trim() || null,
        emergency_contact_phone: input.emergencyContactPhone?.trim() || null,
        address: input.address?.trim() || null,
        blood_type: input.bloodType?.trim() || null,
        allergies: input.allergies?.trim() || null,
        medications: input.medications?.trim() || null,
        medical_conditions: input.medicalConditions?.trim() || null,
        medical_notes: input.medicalNotes?.trim() || null,
      })
      .eq("id", userId)
      .select("*")
      .single();

    if (error || !data) {
      throw new Error(error?.message ?? "Profile could not be saved.");
    }

    await supabase
      .from("beneficiaries")
      .update({ display_name: input.fullName.trim() })
      .eq("account_holder_id", userId)
      .eq("relationship", "self");

    const email = await authEmail();
    return mapPatient(data as ProfileRow, email);
  },

  async getDoctorProfile(userId: string): Promise<DoctorProfile> {
    const [email, profileResult, doctorResult] = await Promise.all([
      authEmail(),
      supabase.from("profiles").select("id, full_name, phone").eq("id", userId).single(),
      supabase
        .from("doctors")
        .select("id, specialty, department, bio, years_experience, consultation_fee")
        .eq("id", userId)
        .single(),
    ]);

    if (profileResult.error || !profileResult.data) {
      throw new Error(profileResult.error?.message ?? "Profile could not be loaded.");
    }
    if (doctorResult.error || !doctorResult.data) {
      throw new Error(doctorResult.error?.message ?? "Doctor record could not be loaded.");
    }

    const profile = profileResult.data as Pick<ProfileRow, "id" | "full_name" | "phone">;
    const doctor = doctorResult.data as DoctorRow;

    return {
      userId: profile.id,
      fullName: profile.full_name,
      email,
      phone: optionalText(profile.phone),
      specialty: doctor.specialty,
      department: doctor.department,
      bio: optionalText(doctor.bio),
      yearsExperience: doctor.years_experience ?? 0,
      consultationFee: Number(doctor.consultation_fee ?? 0),
    };
  },

  async updateDoctorProfile(
    userId: string,
    input: UpdateDoctorProfileInput,
  ): Promise<DoctorProfile> {
    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        full_name: input.fullName.trim(),
        phone: input.phone?.trim() || null,
      })
      .eq("id", userId);

    if (profileError) {
      throw new Error(profileError.message);
    }

    const { error: doctorError } = await supabase
      .from("doctors")
      .update({
        specialty: input.specialty.trim(),
        bio: input.bio?.trim() || null,
        years_experience: Math.max(0, Math.round(input.yearsExperience)),
        consultation_fee: Math.max(0, input.consultationFee),
      })
      .eq("id", userId);

    if (doctorError) {
      throw new Error(doctorError.message);
    }

    return profileService.getDoctorProfile(userId);
  },
};
