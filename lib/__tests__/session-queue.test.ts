import { buildQueueSections, queueActions } from "@/lib/session-queue";
import type { Appointment } from "@/types/scheduling";

const visit = (id: string, extra: Partial<Appointment> = {}): Appointment => ({
  id,
  accountHolderId: "u",
  beneficiaryId: "b",
  doctorId: "d",
  sessionId: "s",
  type: "in-clinic",
  status: "upcoming",
  dbStatus: "confirmed",
  source: "patient",
  ...extra,
});

describe("buildQueueSections", () => {
  it("splits bookings by stage, waiting in arrival order", () => {
    const sections = buildQueueSections([
      visit("booked"),
      visit("second", { checkedInAt: "2026-11-30T08:10:00Z", queueNumber: 2 }),
      visit("first", { checkedInAt: "2026-11-30T08:00:00Z", queueNumber: 1 }),
      visit("called", { checkedInAt: "2026-11-30T07:50:00Z", queueNumber: 3, calledAt: "2026-11-30T09:00:00Z" }),
      visit("seen", { status: "completed", dbStatus: "completed", finishedAt: "2026-11-30T09:20:00Z" }),
      visit("missed", { status: "missed", dbStatus: "no_show", finishedAt: "2026-11-30T13:00:00Z" }),
      visit("gone", { status: "cancelled", dbStatus: "cancelled" }),
    ]);
    expect(sections.waiting.map((row) => row.id)).toEqual(["first", "second"]);
    expect(sections.withDoctor.map((row) => row.id)).toEqual(["called"]);
    expect(sections.notArrived.map((row) => row.id)).toEqual(["booked"]);
    expect(sections.done.map((row) => row.id)).toEqual(["missed", "seen"]);
  });
});

describe("queueActions", () => {
  const clock = { startsAt: "2026-11-30T09:00:00Z", endsAt: "2026-11-30T12:00:00Z", checkInOpensMinutes: 60 };

  it("offers arrival only while check-in is open and no-show once started", () => {
    expect(queueActions("booked", clock, new Date("2026-11-30T07:00:00Z"))).toEqual(["cancel"]);
    expect(queueActions("booked", clock, new Date("2026-11-30T08:30:00Z"))).toEqual(["arrive", "cancel"]);
    expect(queueActions("booked", clock, new Date("2026-11-30T09:30:00Z"))).toEqual(["arrive", "no_show", "cancel"]);
    expect(queueActions("booked", clock, new Date("2026-11-30T12:30:00Z"))).toEqual(["no_show", "cancel"]);
  });

  it("offers the next step for each stage", () => {
    expect(queueActions("waiting", clock)).toEqual(["call", "complete", "no_show"]);
    expect(queueActions("with-doctor", clock)).toEqual(["complete", "requeue"]);
    expect(queueActions("seen", clock)).toEqual(["follow_up"]);
    expect(queueActions("cancelled", clock)).toEqual([]);
  });
});
