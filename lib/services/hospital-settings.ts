import { supabase } from "@/lib/supabase";

export interface HospitalSettings {
  /** IANA zone, e.g. "Africa/Lagos". Decides when a session has ended. */
  timeZone: string;
  /** Patients can book sessions up to this many days ahead. */
  bookingWindowDays: number;
  /** Check-in opens this many minutes before a session starts. */
  checkInOpensMinutes: number;
  remindersEnabled: boolean;
  /** Hour (24h, hospital time) the evening-before reminder starts going out. */
  reminderEveningHour: number;
  /** Hour (24h, hospital time) the same-day reminder starts going out. */
  reminderMorningHour: number;
  /** Booked patients who never check in are marked as no-shows. */
  autoNoShow: boolean;
  /** Minutes after a session ends before no-shows are recorded. */
  noShowAfterMinutes: number;
  waitlistEnabled: boolean;
}

export type EditableSettings = Omit<HospitalSettings, "timeZone">;

export interface CheckInCode {
  code: string;
  rotatedAt: string;
}

const COLUMNS =
  "time_zone, booking_window_days, check_in_opens_minutes, reminders_enabled, reminder_evening_hour, reminder_morning_hour, auto_no_show, no_show_after_minutes, waitlist_enabled";

export const DEFAULT_SETTINGS: HospitalSettings = {
  timeZone: "UTC",
  bookingWindowDays: 60,
  checkInOpensMinutes: 120,
  remindersEnabled: true,
  reminderEveningHour: 18,
  reminderMorningHour: 7,
  autoNoShow: true,
  noShowAfterMinutes: 30,
  waitlistEnabled: true,
};

/** Allowed ranges (mirrors the database check constraints). */
export const SETTING_LIMITS = {
  bookingWindowDays: { min: 1, max: 365 },
  checkInOpensMinutes: { min: 0, max: 720 },
  reminderEveningHour: { min: 12, max: 21 },
  reminderMorningHour: { min: 5, max: 11 },
  noShowAfterMinutes: { min: 0, max: 720 },
} as const;

export class SettingsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SettingsError";
  }
}

type SettingsRow = Record<string, unknown>;

function mapRow(row: SettingsRow | null): HospitalSettings {
  if (!row) {
    return DEFAULT_SETTINGS;
  }
  const num = (key: string, fallback: number) =>
    typeof row[key] === "number" ? (row[key] as number) : fallback;
  const bool = (key: string, fallback: boolean) =>
    typeof row[key] === "boolean" ? (row[key] as boolean) : fallback;
  return {
    timeZone: (row.time_zone as string | undefined) ?? DEFAULT_SETTINGS.timeZone,
    bookingWindowDays: num("booking_window_days", DEFAULT_SETTINGS.bookingWindowDays),
    checkInOpensMinutes: num("check_in_opens_minutes", DEFAULT_SETTINGS.checkInOpensMinutes),
    remindersEnabled: bool("reminders_enabled", DEFAULT_SETTINGS.remindersEnabled),
    reminderEveningHour: num("reminder_evening_hour", DEFAULT_SETTINGS.reminderEveningHour),
    reminderMorningHour: num("reminder_morning_hour", DEFAULT_SETTINGS.reminderMorningHour),
    autoNoShow: bool("auto_no_show", DEFAULT_SETTINGS.autoNoShow),
    noShowAfterMinutes: num("no_show_after_minutes", DEFAULT_SETTINGS.noShowAfterMinutes),
    waitlistEnabled: bool("waitlist_enabled", DEFAULT_SETTINGS.waitlistEnabled),
  };
}

/** Error text for a value outside SETTING_LIMITS, or null when all are valid. */
export function validateSettings(settings: EditableSettings): string | null {
  const labels: Record<keyof typeof SETTING_LIMITS, string> = {
    bookingWindowDays: "Booking window",
    checkInOpensMinutes: "Check-in opening time",
    reminderEveningHour: "Evening reminder time",
    reminderMorningHour: "Morning reminder time",
    noShowAfterMinutes: "No-show grace period",
  };
  for (const key of Object.keys(SETTING_LIMITS) as (keyof typeof SETTING_LIMITS)[]) {
    const value = settings[key];
    const { min, max } = SETTING_LIMITS[key];
    if (!Number.isInteger(value) || value < min || value > max) {
      return `${labels[key]} must be a whole number from ${min} to ${max}.`;
    }
  }
  return null;
}

export const hospitalSettingsService = {
  async get(): Promise<HospitalSettings> {
    const { data, error } = await supabase
      .from("hospital_settings")
      .select(COLUMNS)
      .eq("id", 1)
      .maybeSingle();
    if (error) {
      throw new SettingsError(error.message || "Could not load hospital settings.");
    }
    return mapRow(data as SettingsRow | null);
  },

  /** Admin only (RLS). The database rejects names that aren't real IANA zones. */
  async updateTimeZone(timeZone: string): Promise<HospitalSettings> {
    const zone = timeZone.trim();
    const { data, error } = await supabase
      .from("hospital_settings")
      .update({ time_zone: zone })
      .eq("id", 1)
      .select(COLUMNS)
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
    return mapRow(data as SettingsRow);
  },

  /** Admin only (RLS). */
  async update(settings: EditableSettings): Promise<HospitalSettings> {
    const invalid = validateSettings(settings);
    if (invalid) {
      throw new SettingsError(invalid);
    }
    const { data, error } = await supabase
      .from("hospital_settings")
      .update({
        booking_window_days: settings.bookingWindowDays,
        check_in_opens_minutes: settings.checkInOpensMinutes,
        reminders_enabled: settings.remindersEnabled,
        reminder_evening_hour: settings.reminderEveningHour,
        reminder_morning_hour: settings.reminderMorningHour,
        auto_no_show: settings.autoNoShow,
        no_show_after_minutes: settings.noShowAfterMinutes,
        waitlist_enabled: settings.waitlistEnabled,
      })
      .eq("id", 1)
      .select(COLUMNS)
      .maybeSingle();
    if (error) {
      throw new SettingsError(
        error.code === "23514"
          ? "One of the values is out of range."
          : error.message || "Could not save the settings.",
      );
    }
    if (!data) {
      throw new SettingsError("Only administrators can change hospital settings.");
    }
    return mapRow(data as SettingsRow);
  },

  /** Admin only: the code behind the reception QR poster. */
  async getCheckInCode(): Promise<CheckInCode> {
    const { data, error } = await supabase
      .from("check_in_secret")
      .select("code, rotated_at")
      .eq("id", 1)
      .maybeSingle();
    if (error) {
      throw new SettingsError(error.message || "Could not load the check-in code.");
    }
    if (!data) {
      throw new SettingsError("Only administrators can see the check-in code.");
    }
    return { code: data.code as string, rotatedAt: data.rotated_at as string };
  },

  /** Admin only: issues a new code (the old poster stops working). */
  async rotateCheckInCode(): Promise<CheckInCode> {
    const { data, error } = await supabase.rpc("rotate_check_in_code");
    if (error) {
      throw new SettingsError(error.message || "Could not issue a new code.");
    }
    const payload = (data ?? {}) as { success?: boolean; check_in_code?: string; code?: string };
    if (!payload.success || !payload.check_in_code) {
      throw new SettingsError(
        payload.code === "FORBIDDEN"
          ? "Only administrators can change the check-in code."
          : "Could not issue a new code.",
      );
    }
    return { code: payload.check_in_code, rotatedAt: new Date().toISOString() };
  },
};
