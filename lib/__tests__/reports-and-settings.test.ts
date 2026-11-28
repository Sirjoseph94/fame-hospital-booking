import { contactSentence, DEFAULT_HOSPITAL_INFO, isMissingContact, telUrl } from "@/lib/hospital-info";
import { notificationHref } from "@/lib/notification-routes";
import { DEFAULT_SETTINGS, validateSettings } from "@/lib/services/hospital-settings";
import { mapReport, noShowRate } from "@/lib/services/reports";

// jest.mock is hoisted above the imports by babel-jest.
jest.mock("@/lib/supabase", () => ({ supabase: {} }));

describe("reports", () => {
  it("computes the no-show rate over visits that are over", () => {
    expect(noShowRate({ seen: 9, noShow: 1 })).toBe(10);
    expect(noShowRate({ seen: 0, noShow: 0 })).toBeNull();
  });

  it("maps the report payload, keeping missing averages as null", () => {
    const report = mapReport({
      from: "2026-11-01",
      to: "2026-11-30",
      totals: { booked: 10, seen: 7, no_show: 2, cancelled: 1, upcoming: 1, avg_wait_minutes: 12.5, avg_visit_minutes: null },
      doctors: [{ doctor_id: "d", name: "Dr A", booked: 10, seen: 7, no_show: 2, cancelled: 1, avg_wait_minutes: null }],
      days: [{ date: "2026-11-02", booked: 3, seen: 2, no_show: 1 }],
    });
    expect(report.totals).toMatchObject({ booked: 10, noShow: 2, avgWaitMinutes: 12.5, avgVisitMinutes: null });
    expect(report.doctors[0]).toMatchObject({ name: "Dr A", avgWaitMinutes: null });
    expect(report.days[0]).toEqual({ dateYmd: "2026-11-02", booked: 3, seen: 2, noShow: 1 });
  });
});

describe("settings", () => {
  const { timeZone: _timeZone, ...editable } = DEFAULT_SETTINGS;

  it("accepts the defaults", () => {
    expect(validateSettings(editable)).toBeNull();
  });

  it("rejects values outside the database limits", () => {
    expect(validateSettings({ ...editable, bookingWindowDays: 0 })).toMatch(/Booking window/);
    expect(validateSettings({ ...editable, reminderEveningHour: 23 })).toMatch(/Evening reminder/);
    expect(validateSettings({ ...editable, noShowAfterMinutes: Number.NaN })).toMatch(/grace/);
  });
});

describe("hospital info", () => {
  it("makes tel: links only for real numbers", () => {
    expect(telUrl("+234 (1) 555-0100")).toBe("tel:+23415550100");
    expect(telUrl("")).toBeNull();
  });

  it("words the contact sentence from what is set", () => {
    expect(isMissingContact(DEFAULT_HOSPITAL_INFO)).toBe(true);
    expect(contactSentence(DEFAULT_HOSPITAL_INFO)).toMatch(/reception/);
    expect(contactSentence({ ...DEFAULT_HOSPITAL_INFO, email: "a@b.org", phone: "123", openingHours: "9–5" })).toBe(
      "email a@b.org or call 123 (9–5)",
    );
  });
});

describe("notificationHref", () => {
  it("opens the visit for patients and the work screen for staff", () => {
    expect(notificationHref("patient", { appointmentId: "x" })).toEqual({ pathname: "/visit/[id]", params: { id: "x" } });
    expect(notificationHref("patient", {})).toBe("/visits");
    expect(notificationHref("doctor", { appointmentId: "x" })).toBe("/agenda");
  });
});
