import { describeDelivery } from "@/lib/services/deliveries";
import { groupDeliveries, updateTitle } from "@/lib/services/updates";

jest.mock("@/lib/supabase", () => ({ supabase: {} }));

const row = (
  id: string,
  channel: "email" | "sms" | "push",
  status: string,
  createdAt: string,
  eventType = "visit_booked",
  appointmentId: string | null = "a1",
) => ({
  id,
  appointment_id: appointmentId,
  event_type: eventType,
  channel,
  status,
  created_at: createdAt,
  appointment: appointmentId
    ? {
        doctor_id: "d1",
        appointment_date: "2026-12-01",
        start_time: "09:00:00",
        session: { session_date: "2026-12-01", start_time: "09:00:00", end_time: "12:00:00" },
      }
    : null,
});

describe("groupDeliveries", () => {
  it("merges the three channel rows of one event and lists sent channels", () => {
    const updates = groupDeliveries([
      row("1", "email", "sent", "2026-11-28T10:00:00.123+00:00"),
      row("2", "sms", "skipped", "2026-11-28T10:00:00.123+00:00"),
      row("3", "push", "sent", "2026-11-28T10:00:00.123+00:00"),
    ]);
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      eventType: "visit_booked",
      doctorId: "d1",
      startsAt: "2026-12-01T09:00:00.000Z",
      endsAt: "2026-12-01T12:00:00.000Z",
      sentVia: ["email", "push"],
    });
  });

  it("keeps separate events apart, newest first", () => {
    const updates = groupDeliveries([
      row("1", "email", "skipped", "2026-11-28T09:00:00+00:00"),
      row("2", "email", "skipped", "2026-11-28T11:00:00+00:00", "visit_cancelled"),
    ]);
    expect(updates.map((u) => [u.eventType, u.sentVia])).toEqual([
      ["visit_cancelled", []],
      ["visit_booked", []],
    ]);
  });

  it("copes with an event whose booking no longer exists", () => {
    const [update] = groupDeliveries([row("1", "push", "sent", "2026-11-28T09:00:00+00:00", "visit_cancelled", null)]);
    expect(update).toMatchObject({ appointmentId: null, startsAt: undefined, doctorId: undefined });
  });
});

describe("updateTitle", () => {
  it("words patient events", () => {
    expect(updateTitle("visit_booked")).toBe("Visit booked");
    expect(updateTitle("visit_rescheduled")).toBe("Visit moved");
    expect(updateTitle("anything")).toBe("Update");
  });
});

describe("describeDelivery", () => {
  it("names the event and channel", () => {
    expect(describeDelivery({ eventType: "visit_booked", channel: "sms" })).toBe("Visit booked (SMS)");
    expect(describeDelivery({ eventType: "visit_cancelled", channel: "email" })).toBe("Visit cancelled (email)");
    expect(describeDelivery({ eventType: "visit_rescheduled_doctor", channel: "push" })).toBe("Visit moved (push)");
    expect(describeDelivery({ eventType: "booking_pending_doctor", channel: "email" })).toBe("Visit booked (email)");
  });
});
