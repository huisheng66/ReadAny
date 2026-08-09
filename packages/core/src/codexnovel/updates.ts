import { codexNovelRequest } from "./client";
import { invalidateChapterCache } from "./cache";
import {
  getCodexNovelLocalMetaByNovelId,
  listCodexNovelLocalMeta,
  upsertCodexNovelLocalMeta,
} from "./local-meta";
import { listCodexNovelShelfUpdates } from "./shelf";
import type { CodexNovelTocItem } from "./types";
import { getPlatformService } from "../services/platform";
import { CODEXNOVEL_KV_PREFIX } from "./types";

const SHELF_CHECK_KEY = `${CODEXNOVEL_KV_PREFIX}lastShelfCheckAt`;
const TOC_CACHE_PREFIX = `${CODEXNOVEL_KV_PREFIX}toc.`;

export interface TocDeltaResult {
  novelId: number;
  since: string;
  serverTime: string;
  lastChapterNumber: number;
  lastChapterTitle: string;
  novelUpdatedAt?: string;
  truncated: boolean;
  totalChanged: number;
  items: CodexNovelTocItem[];
}

export async function getCodexNovelTocDelta(
  novelId: number,
  since: string,
  limit = 500,
): Promise<TocDeltaResult> {
  const { data } = await codexNovelRequest<TocDeltaResult>(`/books/${novelId}/toc/delta`, {
    auth: "user-or-site",
    query: { since, limit },
  });
  return data;
}

export async function getLastShelfCheckAt(): Promise<string | null> {
  return getPlatformService().kvGetItem(SHELF_CHECK_KEY);
}

export async function setLastShelfCheckAt(iso: string): Promise<void> {
  await getPlatformService().kvSetItem(SHELF_CHECK_KEY, iso);
}

export interface ShelfCheckResult {
  serverTime: string;
  updatedNovelIds: number[];
  items: Awaited<ReturnType<typeof listCodexNovelShelfUpdates>>["items"];
}

/**
 * Poll shelf updates since last check (or since 24h ago).
 * Updates local meta hasUpdate / last chapter fields.
 */
export async function checkCodexNovelShelfUpdates(options?: {
  since?: string;
}): Promise<ShelfCheckResult> {
  const since =
    options?.since ||
    (await getLastShelfCheckAt()) ||
    new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const data = await listCodexNovelShelfUpdates(since);
  const updatedNovelIds: number[] = [];

  for (const item of data.items || []) {
    updatedNovelIds.push(item.novelId);
    await upsertCodexNovelLocalMeta({
      novelId: item.novelId,
      lastChapterNumber: item.lastChapterNumber || 0,
      lastChapterTitle: item.lastChapterTitle || "",
      novelUpdatedAt: item.novelUpdatedAt || null,
      hasUpdate: Boolean(item.hasUpdate),
      shelfAdded: true,
    });
  }

  if (data.serverTime) {
    await setLastShelfCheckAt(data.serverTime);
  }

  return {
    serverTime: data.serverTime,
    updatedNovelIds,
    items: data.items || [],
  };
}

/**
 * Apply TOC delta for one novel: invalidate changed chapter caches, advance toc_sync_since.
 */
export async function applyCodexNovelTocDelta(novelId: number): Promise<TocDeltaResult | null> {
  const meta = await getCodexNovelLocalMetaByNovelId(novelId);
  const since =
    meta?.tocSyncSince ||
    meta?.novelUpdatedAt ||
    new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const delta = await getCodexNovelTocDelta(novelId, since);
  for (const item of delta.items || []) {
    if (item.chapterNumber) {
      await invalidateChapterCache(novelId, item.chapterNumber);
    }
  }

  await upsertCodexNovelLocalMeta({
    novelId,
    lastChapterNumber: delta.lastChapterNumber || meta?.lastChapterNumber || 0,
    lastChapterTitle: delta.lastChapterTitle || meta?.lastChapterTitle || "",
    novelUpdatedAt: delta.novelUpdatedAt || meta?.novelUpdatedAt || null,
    tocSyncSince: delta.serverTime || since,
    hasUpdate: false,
  });

  return delta;
}

export async function listLocalUpdateBadges(): Promise<
  Array<{ novelId: number; bookId: string; hasUpdate: boolean; lastChapterNumber: number }>
> {
  const rows = await listCodexNovelLocalMeta();
  return rows.map((r) => ({
    novelId: r.novelId,
    bookId: r.bookId,
    hasUpdate: Boolean(r.hasUpdate),
    lastChapterNumber: r.lastChapterNumber,
  }));
}

/** Optional lightweight TOC page cache in kv (JSON). */
export async function cacheTocPage(
  novelId: number,
  page: number,
  payload: unknown,
): Promise<void> {
  await getPlatformService().kvSetItem(
    `${TOC_CACHE_PREFIX}${novelId}.${page}`,
    JSON.stringify({ at: Date.now(), payload }),
  );
}
