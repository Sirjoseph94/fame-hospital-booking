import { groupSlotsByDate } from "@/lib/slot-groups";
import type { Slot } from "@/types/scheduling";

const slot = (id: string, startsAt: string): Slot => ({ id, doctorId: "d1", startsAt, durationMin: 30, status: "available" });

describe("groupSlotsByDate", () => {
  it("groups by day, orders days and slots chronologically", () => {
    const sections = groupSlotsByDate([
      slot("c", "2026-11-25T09:00:00Z"),
      slot("b", "2026-11-24T11:00:00Z"),
      slot("a", "2026-11-24T09:00:00Z"),
    ]);
    expect(sections.map((s) => s.dateKey)).toEqual(["2026-11-24", "2026-11-25"]);
    expect(sections[0]!.title).toBe("Tuesday, Nov 24");
    expect(sections[0]!.slots.map((s) => s.id)).toEqual(["a", "b"]);
  });

  it("returns no sections for no slots", () => {
    expect(groupSlotsByDate([])).toEqual([]);
  });
});
