import { buildIcsContent, escapeIcsText, eventLocation, roomLabel } from "@/lib/services/calendarExport";

// jest.mock is hoisted above the imports by babel-jest.
jest.mock("expo-calendar/legacy", () => ({}));

describe("calendar export", () => {
  it("escapes ICS text", () => {
    expect(escapeIcsText("a,b;c\\d\ne")).toBe("a\\,b\\;c\\\\d\\ne");
  });

  it("labels rooms without doubling the word", () => {
    expect(roomLabel("4")).toBe("Room 4");
    expect(roomLabel("Clinic B")).toBe("Clinic B");
  });

  it("builds an event with location from the hospital details", () => {
    const input = {
      appointmentId: "abc",
      title: "Clinic with Dr A, cardiology",
      startsAt: "2026-12-01T09:00:00Z",
      durationMin: 180,
      type: "in-clinic" as const,
      room: "4",
      hospitalName: "FAME Hospital",
      hospitalAddress: "1 Road; Town",
    };
    expect(eventLocation(input)).toBe("Room 4, FAME Hospital, 1 Road; Town");
    const ics = buildIcsContent(input, new Date("2026-11-28T00:00:00Z"));
    expect(ics).toContain("DTSTART:20261201T090000Z");
    expect(ics).toContain("DTEND:20261201T120000Z");
    expect(ics).toContain("SUMMARY:Clinic with Dr A\\, cardiology");
    expect(ics).toContain("LOCATION:Room 4\\, FAME Hospital\\, 1 Road\\; Town");
  });
});
