import { getDB } from "../db/db-core";
import type { CodexNovelLocalMeta } from "./mapping";
import { toLocalCodexNovelBookId } from "./mapping";

export async function ensureCodexNovelMetaTable(): Promise<void> {
  const database = await getDB();
  await database.execute(`
    CREATE TABLE IF NOT EXISTS codexnovel_books (
      book_id TEXT PRIMARY KEY,
      novel_id INTEGER NOT NULL UNIQUE,
      last_chapter_number INTEGER NOT NULL DEFAULT 0,
      last_chapter_title TEXT NOT NULL DEFAULT '',
      novel_updated_at TEXT,
      toc_sync_since TEXT,
      has_update INTEGER NOT NULL DEFAULT 0,
      shelf_added INTEGER NOT NULL DEFAULT 1,
      updated_at INTEGER NOT NULL
    )
  `);
  await database.execute(
    "CREATE INDEX IF NOT EXISTS idx_codexnovel_books_novel ON codexnovel_books(novel_id)",
  );
}

function rowToMeta(row: Record<string, unknown>): CodexNovelLocalMeta {
  return {
    bookId: String(row.book_id),
    novelId: Number(row.novel_id),
    lastChapterNumber: Number(row.last_chapter_number) || 0,
    lastChapterTitle: String(row.last_chapter_title || ""),
    novelUpdatedAt: (row.novel_updated_at as string) || null,
    tocSyncSince: (row.toc_sync_since as string) || null,
    hasUpdate: Number(row.has_update) ? 1 : 0,
    shelfAdded: Number(row.shelf_added) ? 1 : 0,
    updatedAt: Number(row.updated_at) || 0,
  };
}

export async function upsertCodexNovelLocalMeta(input: {
  novelId: number;
  lastChapterNumber?: number;
  lastChapterTitle?: string;
  novelUpdatedAt?: string | null;
  tocSyncSince?: string | null;
  hasUpdate?: boolean;
  shelfAdded?: boolean;
}): Promise<CodexNovelLocalMeta> {
  await ensureCodexNovelMetaTable();
  const database = await getDB();
  const bookId = toLocalCodexNovelBookId(input.novelId);
  const now = Date.now();
  const existing = await getCodexNovelLocalMetaByNovelId(input.novelId);

  const meta: CodexNovelLocalMeta = {
    bookId,
    novelId: input.novelId,
    lastChapterNumber:
      input.lastChapterNumber ?? existing?.lastChapterNumber ?? 0,
    lastChapterTitle: input.lastChapterTitle ?? existing?.lastChapterTitle ?? "",
    novelUpdatedAt:
      input.novelUpdatedAt !== undefined
        ? input.novelUpdatedAt
        : (existing?.novelUpdatedAt ?? null),
    tocSyncSince:
      input.tocSyncSince !== undefined ? input.tocSyncSince : (existing?.tocSyncSince ?? null),
    hasUpdate:
      input.hasUpdate !== undefined
        ? input.hasUpdate
          ? 1
          : 0
        : (existing?.hasUpdate ?? 0),
    shelfAdded:
      input.shelfAdded !== undefined
        ? input.shelfAdded
          ? 1
          : 0
        : (existing?.shelfAdded ?? 1),
    updatedAt: now,
  };

  await database.execute(
    `INSERT INTO codexnovel_books (
      book_id, novel_id, last_chapter_number, last_chapter_title,
      novel_updated_at, toc_sync_since, has_update, shelf_added, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(book_id) DO UPDATE SET
      novel_id = excluded.novel_id,
      last_chapter_number = excluded.last_chapter_number,
      last_chapter_title = excluded.last_chapter_title,
      novel_updated_at = excluded.novel_updated_at,
      toc_sync_since = excluded.toc_sync_since,
      has_update = excluded.has_update,
      shelf_added = excluded.shelf_added,
      updated_at = excluded.updated_at`,
    [
      meta.bookId,
      meta.novelId,
      meta.lastChapterNumber,
      meta.lastChapterTitle,
      meta.novelUpdatedAt,
      meta.tocSyncSince,
      meta.hasUpdate,
      meta.shelfAdded,
      meta.updatedAt,
    ],
  );
  return meta;
}

export async function getCodexNovelLocalMetaByNovelId(
  novelId: number,
): Promise<CodexNovelLocalMeta | null> {
  await ensureCodexNovelMetaTable();
  const database = await getDB();
  const rows = await database.select<Record<string, unknown>>(
    "SELECT * FROM codexnovel_books WHERE novel_id = ? LIMIT 1",
    [novelId],
  );
  return rows[0] ? rowToMeta(rows[0]) : null;
}

export async function getCodexNovelLocalMetaByBookId(
  bookId: string,
): Promise<CodexNovelLocalMeta | null> {
  await ensureCodexNovelMetaTable();
  const database = await getDB();
  const rows = await database.select<Record<string, unknown>>(
    "SELECT * FROM codexnovel_books WHERE book_id = ? LIMIT 1",
    [bookId],
  );
  return rows[0] ? rowToMeta(rows[0]) : null;
}

export async function listCodexNovelLocalMeta(): Promise<CodexNovelLocalMeta[]> {
  await ensureCodexNovelMetaTable();
  const database = await getDB();
  const rows = await database.select<Record<string, unknown>>(
    "SELECT * FROM codexnovel_books ORDER BY updated_at DESC",
  );
  return rows.map(rowToMeta);
}

export async function deleteCodexNovelLocalMeta(novelId: number): Promise<void> {
  await ensureCodexNovelMetaTable();
  const database = await getDB();
  await database.execute("DELETE FROM codexnovel_books WHERE novel_id = ?", [novelId]);
}
