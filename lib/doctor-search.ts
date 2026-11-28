import type { Doctor } from "@/types/scheduling";

/** Case- and accent-insensitive text for matching. */
function fold(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** Specialties and departments to filter by, alphabetically, without duplicates. */
export function doctorFilterOptions(doctors: Doctor[]): string[] {
  const seen = new Map<string, string>();
  for (const doctor of doctors) {
    for (const value of [doctor.specialty, doctor.department]) {
      const label = value?.trim();
      if (label && !seen.has(fold(label))) {
        seen.set(fold(label), label);
      }
    }
  }
  return [...seen.values()].sort((left, right) => left.localeCompare(right));
}

/**
 * Doctors matching the search (name, specialty, department or bio) and the
 * chosen specialty/department, soonest open session first, then by name.
 */
export function searchDoctors(doctors: Doctor[], query: string, filter: string | null): Doctor[] {
  const terms = fold(query).split(/\s+/).filter(Boolean);
  const wanted = filter ? fold(filter) : null;
  return doctors
    .filter((doctor) => {
      if (wanted && fold(doctor.specialty) !== wanted && fold(doctor.department) !== wanted) {
        return false;
      }
      if (terms.length === 0) return true;
      const haystack = fold([doctor.name, doctor.specialty, doctor.department, doctor.bio ?? ""].join(" "));
      return terms.every((term) => haystack.includes(term));
    })
    .sort((left, right) => {
      const leftTime = left.nextSession ? Date.parse(left.nextSession.startsAt) : Number.POSITIVE_INFINITY;
      const rightTime = right.nextSession ? Date.parse(right.nextSession.startsAt) : Number.POSITIVE_INFINITY;
      return leftTime - rightTime || left.name.localeCompare(right.name);
    });
}

/** The doctor with the earliest open place, if any has one. */
export function firstAvailableDoctor(doctors: Doctor[]): Doctor | null {
  return searchDoctors(doctors, "", null).find((doctor) => doctor.nextSession) ?? null;
}
