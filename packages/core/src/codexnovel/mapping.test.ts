import { describe, expect, it } from "vitest";
import {
  bookFromCodexNovelSummary,
  decodeCodexNovelCfi,
  encodeCodexNovelCfi,
  isCodexNovelBook,
  parseCodexNovelBookId,
  progressRatioFromChapter,
  toLocalCodexNovelBookId,
} from "./mapping";

describe("codexnovel mapping", () => {
  it("maps novel id to stable local book id", () => {
    expect(toLocalCodexNovelBookId(10)).toBe("cn-10");
    expect(parseCodexNovelBookId("cn-10")).toBe(10);
    expect(parseCodexNovelBookId("uuid-local")).toBeNull();
  });

  it("round-trips progress CFI", () => {
    const cfi = encodeCodexNovelCfi(120, 0.37);
    expect(cfi).toBe("codexnovel:ch:120:off:0.37");
    expect(decodeCodexNovelCfi(cfi)).toEqual({ chapterNumber: 120, offsetRatio: 0.37 });
  });

  it("computes progress ratio", () => {
    expect(progressRatioFromChapter(1, 10, 0)).toBeCloseTo(0, 5);
    expect(progressRatioFromChapter(10, 10, 1)).toBeCloseTo(1, 5);
    expect(progressRatioFromChapter(5, 10, 0.5)).toBeCloseTo(0.45, 5);
  });

  it("builds online Book from API summary", () => {
    const book = bookFromCodexNovelSummary({
      id: 7,
      title: "蛊真人",
      author: "蛊真人",
      chapterCount: 100,
      lastChapterNumber: 100,
      coverUrl: "https://example.com/c.jpg",
    });
    expect(book.id).toBe("cn-7");
    expect(book.format).toBe("online");
    expect(book.filePath).toBe("codexnovel://7");
    expect(book.tags).toContain("codexnovel");
    expect(isCodexNovelBook(book)).toBe(true);
  });
});
