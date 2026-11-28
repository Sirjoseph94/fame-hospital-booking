import { supabase } from "@/lib/supabase";

export interface HospitalSettings {
  /** IANA zone, e.g. "Africa/Lagos". Decides when a session has ended. */
  timeZone: string;
}

export class SettingsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SettingsError";
  }
}

export const hospitalSettingsService = {
  async get(): Promise<HospitalSettings> {
    const { data, error } = await supabase
      .from("hospital_settings")
      .select("time_zone")
      .eq("id", 1)
      .maybeSingle();
    if (error) {
      throw new SettingsError(error.message || "Could not load hospital settings.");
    }
    return { timeZone: (data?.time_zone as string | undefined) ?? "UTC" };
  },

  /** Admin only (RLS). The database rejects names that aren't real IANA zones. */
  async updateTimeZone(timeZone: string): Promise<HospitalSettings> {
    const zone = timeZone.trim();
    const { data, error } = await supabase
      .from("hospital_settings")
      .update({ time_zone: zone, updated_at: new Date().toISOString() })
      .eq("id", 1)
      .select("time_zone")
      .maybeSingle();
    if (error) {
      throw new SettingsError(
        error.code === "22023"
          ? `"${zone}" isn't a recognised time zone. Use a name like Africa/Lagos.`
          : error.message || "Could not save the time zone.",
      );
    }
    if (!data) {
      throw new SettingsError("Only administrators can change hospital settings.");
    }
    return { timeZone: data.time_zone as string };
  },
};
