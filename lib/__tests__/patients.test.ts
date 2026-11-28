import { toIlikePattern } from "@/lib/services/patients";

jest.mock("@/lib/supabase", () => ({ supabase: {} }));

describe("toIlikePattern", () => {
  it("wraps the term and escapes LIKE wildcards", () => {
    expect(toIlikePattern(" Ada ")).toBe("%Ada%");
    expect(toIlikePattern("50%_off")).toBe("%50\\%\\_off%");
  });

  it("strips characters that would break a PostgREST or() filter", () => {
    expect(toIlikePattern("a,b(c)")).toBe("%a b c %");
  });
});
