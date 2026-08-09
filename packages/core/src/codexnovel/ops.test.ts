import { describe, expect, it } from "vitest";
import { compareSemver } from "./ops";

describe("compareSemver", () => {
  it("orders versions", () => {
    expect(compareSemver("1.2.0", "1.1.9")).toBe(1);
    expect(compareSemver("1.0.0", "1.0.0")).toBe(0);
    expect(compareSemver("1.0.0", "1.2.0")).toBe(-1);
    expect(compareSemver("v2.0.0", "1.9.9")).toBe(1);
  });
});
