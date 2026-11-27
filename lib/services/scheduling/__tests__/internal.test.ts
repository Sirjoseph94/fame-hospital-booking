import { schedulingErrorFromRpc } from "@/lib/services/scheduling/internal";

// internal.ts imports the Supabase client; these tests only cover pure
// helpers. (jest.mock is hoisted above the import by babel-jest.)
jest.mock("@/lib/supabase", () => ({ supabase: {} }));

describe("schedulingErrorFromRpc", () => {
  it.each([
    ["SESSION_FULL", "SESSION_UNAVAILABLE"],
    ["SESSION_UNAVAILABLE", "SESSION_UNAVAILABLE"],
    ["DOCTOR_UNAVAILABLE", "SESSION_UNAVAILABLE"],
    ["ALREADY_BOOKED", "INVALID_REQUEST"],
    ["WRONG_DOCTOR", "INVALID_REQUEST"],
    ["NOT_MODIFIABLE", "INVALID_REQUEST"],
    ["INVALID_INPUT", "INVALID_REQUEST"],
    ["FORBIDDEN", "FORBIDDEN"],
    ["NOT_AUTHENTICATED", "FORBIDDEN"],
    [undefined, "NETWORK_ERROR"],
    ["SOMETHING_NEW", "NETWORK_ERROR"],
  ])("maps %s to %s", (rpcCode, appCode) => {
    expect(schedulingErrorFromRpc(rpcCode).code).toBe(appCode);
  });

  it("tells the patient to pick another session when one fills up", () => {
    expect(schedulingErrorFromRpc("SESSION_FULL").message).toMatch(/filled up/);
  });
});
