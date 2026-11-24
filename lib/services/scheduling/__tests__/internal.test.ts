import { previousYmd } from "@/lib/services/scheduling/internal";

// internal.ts imports the Supabase client; these tests only cover pure
// helpers. (jest.mock is hoisted above the import by babel-jest.)
jest.mock("@/lib/supabase", () => ({ supabase: {} }));

describe("previousYmd", () => {
  it("handles month and year boundaries", () => {
    expect(previousYmd("2026-11-24")).toBe("2026-11-23");
    expect(previousYmd("2026-03-01")).toBe("2026-02-28");
    expect(previousYmd("2027-01-01")).toBe("2026-12-31");
  });
});
