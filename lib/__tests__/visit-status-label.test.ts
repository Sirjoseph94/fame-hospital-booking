import { visitStatusLabel } from "@/lib/visit-status-label";

describe("visitStatusLabel", () => {
  it.each([
    ["patient", "Awaiting confirmation"],
    ["doctor", "Needs confirmation"],
    ["admin", "Pending"],
  ] as const)("words a pending visit for %s", (audience, label) => {
    expect(visitStatusLabel("upcoming", "pending", audience)).toBe(label);
  });

  it.each(["patient", "doctor", "admin"] as const)(
    "uses shared labels for terminal states (%s)",
    (audience) => {
      expect(visitStatusLabel("completed", "completed", audience)).toBe(audience === "patient" ? "Completed" : "Seen");
      expect(visitStatusLabel("cancelled", "cancelled", audience)).toBe("Cancelled");
      expect(visitStatusLabel("upcoming", "confirmed", audience)).toBe("Confirmed");
    },
  );

  it.each([
    ["patient", "Awaiting confirmation", "Not confirmed"],
    ["doctor", "Needs confirmation", "Needs confirmation"],
    ["admin", "Pending", "Not confirmed"],
  ] as const)(
    "words a pending visit for %s before and after its start time",
    (audience, before, after) => {
      const now = new Date("2026-11-24T10:00:00Z");
      expect(visitStatusLabel("upcoming", "pending", audience, "2026-11-24T11:00:00Z", now)).toBe(before);
      expect(visitStatusLabel("upcoming", "pending", audience, "2026-11-24T09:00:00Z", now)).toBe(after);
    },
  );

  it("falls back per audience when the DB status is unknown", () => {
    expect(visitStatusLabel("upcoming", undefined, "patient")).toBe("Upcoming");
    expect(visitStatusLabel("upcoming", undefined, "admin")).toBe("Upcoming");
    expect(visitStatusLabel("upcoming", undefined, "doctor")).toBe("Confirmed");
  });

  it("words missed visits and queue progress for each audience", () => {
    expect(visitStatusLabel("missed", "no_show", "patient")).toBe("Missed");
    expect(visitStatusLabel("missed", "no_show", "doctor")).toBe("No-show");
    const waiting = { checkedInAt: "2026-11-30T08:00:00Z", queueNumber: 3 };
    expect(visitStatusLabel("upcoming", "confirmed", "patient", undefined, new Date(), waiting)).toBe("Checked in · #3");
    expect(visitStatusLabel("upcoming", "confirmed", "doctor", undefined, new Date(), waiting)).toBe("Arrived · #3");
    const called = { ...waiting, calledAt: "2026-11-30T09:00:00Z" };
    expect(visitStatusLabel("upcoming", "confirmed", "patient", undefined, new Date(), called)).toBe("Your turn");
    expect(visitStatusLabel("upcoming", "confirmed", "admin", undefined, new Date(), called)).toBe("With doctor");
  });
});
