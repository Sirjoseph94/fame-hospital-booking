import {
  buildDoctorAgendaTimeline,
  canDoctorMarkVisitComplete,
  doctorProxyTag,
  filterVisitsForDay,
  type DoctorAgendaVisit,
} from "@/lib/doctor-agenda-helpers";

const visit = (id: string, startsAt: string, endsAt: string, status: DoctorAgendaVisit["status"] = "upcoming"): DoctorAgendaVisit => ({
  id,
  accountHolderId: "u1",
  beneficiaryId: "b1",
  doctorId: "d1",
  slotId: `slot-${id}`,
  type: "in-clinic",
  status,
  dbStatus: status === "cancelled" ? "cancelled" : "confirmed",
  startsAt,
  endsAt,
  beneficiaryName: "Pat",
  accountHolderName: "Pat",
  relationship: "self",
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

  it("adds a buffer after each non-cancelled visit, sorted by start", () => {
    const timeline = buildDoctorAgendaTimeline(
      [
        visit("late", "2026-11-24T11:00:00Z", "2026-11-24T11:30:00Z"),
        visit("cancelled", "2026-11-24T10:00:00Z", "2026-11-24T10:30:00Z", "cancelled"),
        visit("early", "2026-11-24T09:00:00Z", "2026-11-24T09:30:00Z"),
      ],
      15,
    );
    expect(timeline.map((i) => (i.kind === "visit" ? i.visit.id : `buffer@${i.startsAt}`))).toEqual([
      "early",
      "buffer@2026-11-24T09:30:00Z",
      "cancelled",
      "late",
      "buffer@2026-11-24T11:30:00Z",
    ]);
    const buffer = timeline[1];
    expect(buffer).toMatchObject({ kind: "buffer", minutes: 15, endsAt: "2026-11-24T09:45:00.000Z" });
  });

  it("adds no buffers when the buffer is zero", () => {
    const timeline = buildDoctorAgendaTimeline([visit("a", "2026-11-24T09:00:00Z", "2026-11-24T09:30:00Z")], 0);
    expect(timeline).toHaveLength(1);
  });

  it("allows completing a visit only once it has started", () => {
    const now = new Date("2026-11-24T10:00:00Z");
    expect(canDoctorMarkVisitComplete("2026-11-24T10:00:00Z", now)).toBe(true);
    expect(canDoctorMarkVisitComplete("2026-11-24T09:30:00Z", now)).toBe(true);
    expect(canDoctorMarkVisitComplete("2026-11-23T15:00:00Z", now)).toBe(true);
    // Later the same day is not completable yet.
    expect(canDoctorMarkVisitComplete("2026-11-24T15:00:00Z", now)).toBe(false);
    expect(canDoctorMarkVisitComplete("2026-11-25T09:00:00Z", now)).toBe(false);
  });
});
