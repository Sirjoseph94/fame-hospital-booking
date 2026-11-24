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
      expect(visitStatusLabel("completed", "completed", audience)).toBe("Completed");
      expect(visitStatusLabel("cancelled", "cancelled", audience)).toBe("Cancelled");
      expect(visitStatusLabel("upcoming", "confirmed", audience)).toBe("Confirmed");
    },
  );

  it("falls back per audience when the DB status is unknown", () => {
    expect(visitStatusLabel("upcoming", undefined, "patient")).toBe("Upcoming");
    expect(visitStatusLabel("upcoming", undefined, "admin")).toBe("Upcoming");
    expect(visitStatusLabel("upcoming", undefined, "doctor")).toBe("Confirmed");
  });
});
