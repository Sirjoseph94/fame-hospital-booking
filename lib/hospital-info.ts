/**
 * Hospital contact details. The real values live in the `hospital_info`
 * table (admin → Settings); this is only what the app shows before they load
 * or when offline. Phone and email are deliberately empty: the app hides what
 * isn't set rather than showing placeholder contacts.
 */
export interface HospitalInfo {
  name: string;
  about: string;
  phone: string;
  emergencyPhone: string;
  email: string;
  address: string;
  openingHours: string;
  website: string;
  updatedAt?: string;
}

export const DEFAULT_HOSPITAL_INFO: HospitalInfo = {
  name: "FAME Hospital",
  about:
    "Book a place in a doctor's clinic session. Patients are seen in order of arrival.",
  phone: "",
  emergencyPhone: "",
  email: "",
  address: "",
  openingHours: "",
  website: "",
};

/** "tel:" link for a display phone number, or null when there isn't one. */
export function telUrl(phone: string): string | null {
  const digits = phone.replace(/[^\d+]/g, "");
  return digits.length >= 3 ? `tel:${digits}` : null;
}

/** Map search link for an address. */
export function mapsUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

/** Contact sentence for legal text: "email x or call y", or a fallback. */
export function contactSentence(info: HospitalInfo): string {
  const parts = [
    info.email ? `email ${info.email}` : null,
    info.phone ? `call ${info.phone}${info.openingHours ? ` (${info.openingHours})` : ""}` : null,
  ].filter(Boolean);
  return parts.length > 0
    ? parts.join(" or ")
    : `contact ${info.name} reception (details on the About screen)`;
}

/** True when the admin hasn't entered a way to reach the hospital yet. */
export function isMissingContact(info: HospitalInfo): boolean {
  return !info.phone && !info.email;
}
