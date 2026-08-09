import type { Book } from "../types";
import type { CodexNovelBookSummary, CodexNovelProgress, CodexNovelShelfItem } from "./types";

export const CODEXNOVEL_BOOK_ID_PREFIX = "cn-";
export const CODEXNOVEL_FILE_SCHEME = "codexnovel://";
export const CODEXNOVEL_TAG = "codexnovel";

export function toLocalCodexNovelBookId(novelId: number): string {
  return `${CODEXNOVEL_BOOK_ID_PREFIX}${novelId}`;
}

export function parseCodexNovelBookId(bookId: string): number | null {
  if (!bookId.startsWith(CODEXNOVEL_BOOK_ID_PREFIX)) return null;
  const n = Number.parseInt(bookId.slice(CODEXNOVEL_BOOK_ID_PREFIX.length), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function isCodexNovelBookId(bookId: string): boolean {
  return parseCodexNovelBookId(bookId) !== null;
}

export function isCodexNovelBook(book: Pick<Book, "id" | "format" | "filePath" | "tags">): boolean {
  if (book.format === "online") return true;
  if (book.filePath?.startsWith(CODEXNOVEL_FILE_SCHEME)) return true;
  if (isCodexNovelBookId(book.id)) return true;
  return Array.isArray(book.tags) && book.tags.includes(CODEXNOVEL_TAG);
}

export function codexNovelFilePath(novelId: number): string {
  return `${CODEXNOVEL_FILE_SCHEME}${novelId}`;
}

export function encodeCodexNovelCfi(chapterNumber: number, offsetRatio: number): string {
  const ch = Math.max(1, Math.floor(chapterNumber) || 1);
  const off = Math.max(0, Math.min(1, Number.isFinite(offsetRatio) ? offsetRatio : 0));
  // keep compact fixed precision
  const offStr = off.toFixed(6).replace(/\.?0+$/, "") || "0";
  return `codexnovel:ch:${ch}:off:${offStr}`;
}

export function decodeCodexNovelCfi(
  cfi: string | null | undefined,
): { chapterNumber: number; offsetRatio: number } | null {
  if (!cfi) return null;
  const m = /^codexnovel:ch:(\d+):off:([0-9]*\.?[0-9]+)$/.exec(cfi.trim());
  if (!m) return null;
  const chapterNumber = Number.parseInt(m[1], 10);
  const offsetRatio = Number.parseFloat(m[2]);
  if (!Number.isFinite(chapterNumber) || chapterNumber < 1) return null;
  if (!Number.isFinite(offsetRatio)) return null;
  return {
    chapterNumber,
    offsetRatio: Math.max(0, Math.min(1, offsetRatio)),
  };
}

export function progressRatioFromChapter(
  chapterNumber: number,
  lastChapterNumber?: number | null,
  offsetRatio = 0,
): number {
  const last = Math.max(1, lastChapterNumber || 1);
  const ch = Math.max(1, chapterNumber || 1);
  const base = (ch - 1 + Math.max(0, Math.min(1, offsetRatio))) / last;
  return Math.max(0, Math.min(1, base));
}

function ensureTags(tags: string[] | undefined): string[] {
  const set = new Set(tags || []);
  set.add(CODEXNOVEL_TAG);
  return [...set];
}

/** Build a local Book row from API book summary (not yet in shelf). */
export function bookFromCodexNovelSummary(
  item: CodexNovelBookSummary,
  extras?: { progress?: CodexNovelProgress | null; addedAt?: number; lastOpenedAt?: number },
): Book {
  const novelId = item.id;
  const progress = extras?.progress;
  const chapterNumber = progress?.chapterNumber || 1;
  const offsetRatio = progress?.offsetRatio ?? 0;
  const lastChapter = item.lastChapterNumber || item.chapterCount || 1;

  return {
    id: toLocalCodexNovelBookId(novelId),
    filePath: codexNovelFilePath(novelId),
    format: "online",
    meta: {
      title: item.title || "Untitled",
      author: item.author || "",
      description: item.description || undefined,
      coverUrl: item.coverUrl || undefined,
      totalChapters: item.chapterCount || item.lastChapterNumber || undefined,
    },
    addedAt: extras?.addedAt ?? Date.now(),
    lastOpenedAt: extras?.lastOpenedAt,
    updatedAt: Date.now(),
    progress: progress
      ? progressRatioFromChapter(chapterNumber, lastChapter, offsetRatio)
      : 0,
    currentCfi: progress ? encodeCodexNovelCfi(chapterNumber, offsetRatio) : undefined,
    isVectorized: false,
    vectorizeProgress: 0,
    tags: ensureTags([]),
    syncStatus: "local",
  };
}

export function bookFromCodexNovelShelfItem(item: CodexNovelShelfItem): Book {
  const addedAt = item.addedAt ? Date.parse(item.addedAt) || Date.now() : Date.now();
  const lastOpenedAt = item.lastOpenedAt ? Date.parse(item.lastOpenedAt) || undefined : undefined;
  return bookFromCodexNovelSummary(
    {
      id: item.novelId,
      title: item.title,
      author: item.author,
      coverUrl: item.coverUrl,
      status: item.status,
      lastChapterNumber: item.lastChapterNumber,
      lastChapterTitle: item.lastChapterTitle,
      updatedAt: item.novelUpdatedAt,
    },
    {
      progress: item.progress,
      addedAt,
      lastOpenedAt,
    },
  );
}

export interface CodexNovelLocalMeta {
  bookId: string;
  novelId: number;
  lastChapterNumber: number;
  lastChapterTitle: string;
  novelUpdatedAt: string | null;
  tocSyncSince: string | null;
  hasUpdate: number;
  shelfAdded: number;
  updatedAt: number;
}
