import { describe, expect, it } from "vitest";
import { mapHttpStatusToCode } from "./errors";

describe("updates helpers smoke", () => {
  it("maps rate limit for update polling backoff", () => {
    expect(mapHttpStatusToCode(429, "RATE_LIMITED")).toBe("RATE_LIMITED");
  });
});
