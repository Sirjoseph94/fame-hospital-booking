import type { AppointmentType } from "@/types/scheduling";

export interface ConfirmVisitFormFields {
  room: string;
  videoUrl: string;
}

export function validateConfirmVisitFields(
  type: AppointmentType,
  values: ConfirmVisitFormFields,
): string | null {
  if (type === "in-clinic") {
    if (values.room.length < 1) {
      return "Enter a room or clinic location.";
    }
    return null;
  }
  if (type === "telehealth") {
    const url = values.videoUrl.trim();
    if (url.length < 8) {
      return "Enter a telehealth meeting link.";
    }
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return "Enter a valid http or https link.";
      }
    } catch {
      return "Enter a valid telehealth link.";
    }
    return null;
  }
  return null;
}
