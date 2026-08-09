import { describe, expect, it } from "vitest";
import { buildCodexNovelApiUrl, normalizeCodexNovelBaseUrl } from "./config";
import { CodexNovelError } from "./errors";

describe("normalizeCodexNovelBaseUrl", () => {
  it("strips trailing slash and keeps origin", () => {
    expect(normalizeCodexNovelBaseUrl("http://127.0.0.1:3008/")).toBe("http://127.0.0.1:3008");
  });

  it("strips trailing /api/v1 if pasted", () => {
    expect(normalizeCodexNovelBaseUrl("https://novel.example.com/api/v1")).toBe(
      "https://novel.example.com",
    );
    expect(normalizeCodexNovelBaseUrl("https://novel.example.com/api/v1/")).toBe(
      "https://novel.example.com",
    );
  });

  it("adds http when protocol missing", () => {
    expect(normalizeCodexNovelBaseUrl("localhost:3008")).toBe("http://localhost:3008");
  });

  it("rejects empty input", () => {
    expect(() => normalizeCodexNovelBaseUrl("  ")).toThrow(CodexNovelError);
  });
});

describe("buildCodexNovelApiUrl", () => {
  it("prefixes /api/v1 for relative paths", () => {
    expect(buildCodexNovelApiUrl("http://127.0.0.1:3008", "/health")).toBe(
      "http://127.0.0.1:3008/api/v1/health",
    );
    expect(buildCodexNovelApiUrl("http://127.0.0.1:3008", "books")).toBe(
      "http://127.0.0.1:3008/api/v1/books",
    );
  });

  it("does not double-prefix when path already has /api/v1", () => {
    expect(buildCodexNovelApiUrl("http://127.0.0.1:3008", "/api/v1/health")).toBe(
      "http://127.0.0.1:3008/api/v1/health",
    );
  });
});
