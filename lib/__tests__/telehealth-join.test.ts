import { telehealthJoinState } from "@/lib/telehealth-join";

const now = new Date("2026-11-24T10:00:00Z");

describe("telehealthJoinState", () => {
  it("hides the join button more than 15 minutes ahead", () => {
    expect(telehealthJoinState("2026-11-24T10:16:00Z", now)).toEqual({ showJoin: false, label: "" });
  });

  it("counts down inside the 15-minute window", () => {
    expect(telehealthJoinState("2026-11-24T10:15:00Z", now)).toEqual({ showJoin: true, label: "Join in 15 min" });
    expect(telehealthJoinState("2026-11-24T10:01:00Z", now)).toEqual({ showJoin: true, label: "Join in 1 min" });
  });

  it("offers to join once the visit has started", () => {
    expect(telehealthJoinState("2026-11-24T10:00:00Z", now)).toEqual({ showJoin: true, label: "Join visit" });
    expect(telehealthJoinState("2026-11-24T09:30:00Z", now)).toEqual({ showJoin: true, label: "Join visit" });
  });
});
