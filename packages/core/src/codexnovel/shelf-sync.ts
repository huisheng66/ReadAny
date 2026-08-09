/**
 * Pull remote shelf into local books + codexnovel_books meta.
 */
import { getBook, insertBook, updateBook } from "../db/book-queries";
import {
  bookFromCodexNovelShelfItem,
  bookFromCodexNovelSummary,
  toLocalCodexNovelBookId,
} from "./mapping";
import { deleteCodexNovelLocalMeta, upsertCodexNovelLocalMeta } from "./local-meta";
import { addCodexNovelToShelf, listCodexNovelShelf } from "./shelf";
import type { CodexNovelBookSummary } from "./types";
import type { Book } from "../types";

export interface SyncShelfResult {
  books: Book[];
  added: number;
  updated: number;
}

export async function syncCodexNovelShelfToLibrary(): Promise<SyncShelfResult> {
  const items = await listCodexNovelShelf();
  let added = 0;
  let updated = 0;
  const books: Book[] = [];

  for (const item of items) {
    const draft = bookFromCodexNovelShelfItem(item);
    const existing = await getBook(draft.id, { includeDeleted: true });

    if (!existing) {
      await insertBook(draft);
      added += 1;
      books.push(draft);
    } else {
      await updateBook(draft.id, {
        meta: {
          ...existing.meta,
          title: draft.meta.title,
          author: draft.meta.author,
          description: draft.meta.description ?? existing.meta.description,
          coverUrl: draft.meta.coverUrl ?? existing.meta.coverUrl,
          totalChapters: draft.meta.totalChapters ?? existing.meta.totalChapters,
        },
        format: "online",
        filePath: draft.filePath,
        tags: Array.from(new Set([...(existing.tags || []), "codexnovel"])),
        // Prefer remote progress if newer (LWW by updatedAt ISO)
        ...(shouldApplyRemoteProgress(existing, draft)
          ? {
              progress: draft.progress,
              currentCfi: draft.currentCfi,
            }
          : {}),
        deletedAt: undefined,
      });
      updated += 1;
      const merged = (await getBook(draft.id)) || draft;
      books.push(merged);
    }

    await upsertCodexNovelLocalMeta({
      novelId: item.novelId,
      lastChapterNumber: item.lastChapterNumber || 0,
      lastChapterTitle: item.lastChapterTitle || "",
      novelUpdatedAt: item.novelUpdatedAt || null,
      hasUpdate: Boolean(item.hasUpdate),
      shelfAdded: true,
    });
  }

  return { books, added, updated };
}

function shouldApplyRemoteProgress(local: Book, remote: Book): boolean {
  if (!remote.currentCfi) return false;
  if (!local.currentCfi) return true;
  // Shelf progress.updatedAt is not on Book; use meta via remote always if local has no online cfi
  if (!local.currentCfi.startsWith("codexnovel:")) return true;
  // Without timestamps on Book, prefer remote when syncing shelf (server is LWW source of truth for multi-device)
  return true;
}

export async function removeCodexNovelFromLocalLibrary(novelId: number): Promise<void> {
  const { deleteBook } = await import("../db/book-queries");
  const bookId = toLocalCodexNovelBookId(novelId);
  await deleteBook(bookId, { preserveData: false });
  await deleteCodexNovelLocalMeta(novelId);
}

/**
 * Ensure a remote book exists locally (and on shelf), ready to open in OnlineReader.
 * Returns local book id `cn-{novelId}`.
 */
export async function ensureCodexNovelBookReady(summary: CodexNovelBookSummary): Promise<Book> {
  const chapterCount = summary.chapterCount ?? summary.lastChapterNumber ?? 0;
  if (!chapterCount || chapterCount <= 0) {
    throw new Error("本书暂无章节，无法阅读");
  }

  try {
    await addCodexNovelToShelf(summary.id);
  } catch {
    // already on shelf or transient — still try local upsert
  }

  const draft = bookFromCodexNovelSummary(summary);
  const existing = await getBook(draft.id, { includeDeleted: true });
  if (!existing) {
    await insertBook(draft);
  } else {
    await updateBook(draft.id, {
      meta: {
        ...existing.meta,
        title: draft.meta.title,
        author: draft.meta.author,
        description: draft.meta.description ?? existing.meta.description,
        coverUrl: draft.meta.coverUrl ?? existing.meta.coverUrl,
        totalChapters: draft.meta.totalChapters ?? existing.meta.totalChapters,
      },
      format: "online",
      filePath: draft.filePath,
      tags: Array.from(new Set([...(existing.tags || []), "codexnovel"])),
      deletedAt: undefined,
    });
  }

  await upsertCodexNovelLocalMeta({
    novelId: summary.id,
    lastChapterNumber: summary.lastChapterNumber || chapterCount,
    lastChapterTitle: summary.lastChapterTitle || "",
    novelUpdatedAt: summary.updatedAt || null,
    shelfAdded: true,
  });

  return (await getBook(draft.id)) || draft;
}
