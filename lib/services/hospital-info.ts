import { DEFAULT_HOSPITAL_INFO, type HospitalInfo } from "@/lib/hospital-info";
import { supabase } from "@/lib/supabase";

interface HospitalInfoRow {
  name: string;
  about: string;
  phone: string;
  emergency_phone: string;
  email: string;
  address: string;
  opening_hours: string;
  website: string;
  updated_at: string;
}

const COLUMNS = "name, about, phone, emergency_phone, email, address, opening_hours, website, updated_at";

export class HospitalInfoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HospitalInfoError";
  }
}

function mapRow(row: HospitalInfoRow | null): HospitalInfo {
  if (!row) {
    return DEFAULT_HOSPITAL_INFO;
  }
  return {
    name: row.name || DEFAULT_HOSPITAL_INFO.name,
    about: row.about ?? "",
    phone: row.phone ?? "",
    emergencyPhone: row.emergency_phone ?? "",
    email: row.email ?? "",
    address: row.address ?? "",
    openingHours: row.opening_hours ?? "",
    website: row.website ?? "",
    updatedAt: row.updated_at,
  };
}

/** Readable message for a check-constraint failure on hospital_info. */
function constraintMessage(message: string): string {
  if (message.includes("email")) return "Enter a valid email address, or leave it empty.";
  if (message.includes("website")) return "The website must start with https://.";
  if (message.includes("phone")) return "Phone numbers can only contain digits, spaces and + ( ) - .";
  if (message.includes("name")) return "Enter the hospital's name.";
  return "Some details are too long or invalid.";
}

export const hospitalInfoService = {
  /** Public: works signed out (legal pages, account deletion page). */
  async get(): Promise<HospitalInfo> {
    const { data, error } = await supabase
      .from("hospital_info")
      .select(COLUMNS)
      .eq("id", 1)
      .maybeSingle();
    if (error) {
      throw new HospitalInfoError(error.message || "Could not load hospital details.");
    }
    return mapRow(data as HospitalInfoRow | null);
  },

  /** Admin only (RLS). */
  async update(info: Omit<HospitalInfo, "updatedAt">): Promise<HospitalInfo> {
    const { data, error } = await supabase
      .from("hospital_info")
      .update({
        name: info.name.trim(),
        about: info.about.trim(),
        phone: info.phone.trim(),
        emergency_phone: info.emergencyPhone.trim(),
        email: info.email.trim(),
        address: info.address.trim(),
        opening_hours: info.openingHours.trim(),
        website: info.website.trim(),
      })
      .eq("id", 1)
      .select(COLUMNS)
      .maybeSingle();
    if (error) {
      throw new HospitalInfoError(
        error.code === "23514" ? constraintMessage(error.message) : error.message || "Could not save.",
      );
    }
    if (!data) {
      throw new HospitalInfoError("Only administrators can change hospital details.");
    }
    return mapRow(data as HospitalInfoRow);
  },
};
