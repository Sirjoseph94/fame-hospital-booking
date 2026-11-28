import {
  doctorProxyTag,
  filterVisitsForDay,
  groupVisitsBySession,
  type DoctorAgendaVisit,
} from "@/lib/doctor-agenda-helpers";
import type { ClinicSession } from "@/types/scheduling";

const visit = (
  id: string,
  startsAt: string,
  endsAt: string,
  status: DoctorAgendaVisit["status"] = "upcoming",
  sessionId?: string,
): DoctorAgendaVisit => ({
  id,
  accountHolderId: "u1",
  beneficiaryId: "b1",
  doctorId: "d1",
  sessionId,
  type: "in-clinic",
  status,
  dbStatus: status === "cancelled" ? "cancelled" : "confirmed",
  startsAt,
  endsAt,
  beneficiaryName: "Pat",
  accountHolderName: "Pat",
  relationship: "self",
  source: "patient",
});

describe("doctor agenda helpers", () => {
  it("tags visits booked on someone else's behalf", () => {
    expect(doctorProxyTag("Sam", "self")).toBeUndefined();
    expect(doctorProxyTag("Sam", "child")).toBe("Booked by Sam [child]");
  });

  it("filters to one calendar day", () => {
    const visits = [visit("a", "2026-11-24T09:00:00Z", "2026-11-24T09:30:00Z"), visit("b", "2026-11-25T09:00:00Z", "2026-11-25T09:30:00Z")];
    expect(filterVisitsForDay(visits, new Date("2026-11-24T12:00:00Z")).map((v) => v.id)).toEqual(["a"]);
  });

  it("groups visits under their session, sessions in start order, empty sessions kept", () => {
    const session = (id: string, startsAt: string, endsAt: string): ClinicSession => ({
      id,
      doctorId: "d1",
      dateYmd: "2026-11-24",
      startsAt,
      endsAt,
      capacity: 10,
      bookedCount: 0,
      placesLeft: 10,
      status: "scheduled",
      isBookable: true,
      inBookingWindow: true,
      waitlistCount: 0,
    });
    const am = session("am", "2026-11-24T09:00:00Z", "2026-11-24T12:00:00Z");
    const pm = session("pm", "2026-11-24T14:00:00Z", "2026-11-24T17:00:00Z");
    const empty = session("eve", "2026-11-24T18:00:00Z", "2026-11-24T19:00:00Z");

    const groups = groupVisitsBySession(
      [
        visit("first", am.startsAt, am.endsAt, "upcoming", "am"),
        visit("gone", am.startsAt, am.endsAt, "cancelled", "am"),
        visit("second", am.startsAt, am.endsAt, "upcoming", "am"),
        visit("afternoon", pm.startsAt, pm.endsAt, "completed", "pm"),
        visit("legacy", "2026-11-24T08:00:00Z", "2026-11-24T08:30:00Z"),
      ],
      [pm, empty, am],
    );

    expect(
      groups.map((g) => [g.session?.id ?? null, g.visits.map((v) => v.id), g.cancelled.map((v) => v.id)]),
    ).toEqual([
      ["am", ["first", "second"], ["gone"]],
      ["pm", ["afternoon"], []],
      ["eve", [], []],
      [null, ["legacy"], []],
    ]);
  });

  it("adds no extra group when every visit has a session", () => {
    expect(groupVisitsBySession([], [])).toEqual([]);
  });
});
