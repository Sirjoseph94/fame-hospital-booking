import { doctorFilterOptions, firstAvailableDoctor, searchDoctors } from "@/lib/doctor-search";
import type { Doctor } from "@/types/scheduling";

const doctor = (id: string, name: string, specialty: string, department: string, startsAt?: string): Doctor => ({
  id,
  name,
  specialty,
  department,
  isAcceptingBookings: true,
  nextSession: startsAt ? { sessionId: `s-${id}`, startsAt, endsAt: startsAt, placesLeft: 3 } : null,
});

const doctors = [
  doctor("a", "Dr Adé Okafor", "Cardiology", "Outpatients", "2026-12-03T09:00:00Z"),
  doctor("b", "Dr Bola Ade", "Paediatrics", "Children's Clinic", "2026-12-01T09:00:00Z"),
  doctor("c", "Dr Chi Eze", "Cardiology", "Heart Unit"),
];

describe("doctor search", () => {
  it("matches name, specialty or department, ignoring case and accents", () => {
    expect(searchDoctors(doctors, "ade", null).map((row) => row.id)).toEqual(["b", "a"]);
    expect(searchDoctors(doctors, "CARDIO", null).map((row) => row.id)).toEqual(["a", "c"]);
    expect(searchDoctors(doctors, "heart unit", null).map((row) => row.id)).toEqual(["c"]);
  });

  it("filters by specialty or department and sorts soonest first", () => {
    expect(searchDoctors(doctors, "", "Cardiology").map((row) => row.id)).toEqual(["a", "c"]);
    expect(searchDoctors(doctors, "", null).map((row) => row.id)).toEqual(["b", "a", "c"]);
  });

  it("lists filter options once each, alphabetically", () => {
    expect(doctorFilterOptions(doctors)).toEqual([
      "Cardiology",
      "Children's Clinic",
      "Heart Unit",
      "Outpatients",
      "Paediatrics",
    ]);
  });

  it("finds the first available doctor", () => {
    expect(firstAvailableDoctor(doctors)?.id).toBe("b");
    expect(firstAvailableDoctor([doctors[2]!])).toBeNull();
  });
});
