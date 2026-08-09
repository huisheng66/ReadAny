import { getPlatformService } from "../services/platform";
import { codexNovelRequest } from "./client";
import { CodexNovelError } from "./errors";
import { getStoredDeviceName } from "./token-store";
import type { CodexNovelProgress } from "./types";
import { CODEXNOVEL_KV_PREFIX } from "./types";

const QUEUE_KEY = `${CODEXNOVEL_KV_PREFIX}progressQueue`;

export interface ProgressPutInput {
  novelId: number;
  chapterNumber: number;
  offsetRatio: number;
  updatedAt?: string;
  deviceName?: string;
}

export interface ProgressPutResult {
  applied: boolean;
  progress: CodexNovelProgress;
}

export interface ProgressBatchResult {
  appliedCount: number;
  skippedCount: number;
  errorCount: number;
  serverTime: string;
  results: Array<{
    novelId: number;
    applied?: boolean;
    progress?: CodexNovelProgress;
    error?: { code: string; message: string };
  }>;
}

export type ProgressQueueItem = ProgressPutInput & { updatedAt: string };

export async function getCodexNovelProgress(novelId: number): Promise<CodexNovelProgress | null> {
  try {
    const { data } = await codexNovelRequest<CodexNovelProgress | { progress?: CodexNovelProgress }>(
      `/me/progress/${novelId}`,
      { auth: "user" },
    );
    if (!data) return null;
    if ("chapterNumber" in data && typeof data.chapterNumber === "number") {
      return data as CodexNovelProgress;
    }
    const wrapped = data as { progress?: CodexNovelProgress };
    return wrapped.progress || null;
  } catch (err) {
    if (err instanceof CodexNovelError && err.code === "NOT_FOUND") return null;
    throw err;
  }
}

export async function putCodexNovelProgress(input: ProgressPutInput): Promise<ProgressPutResult> {
  const deviceName = input.deviceName || (await getStoredDeviceName()) || "ReadAny";
  const updatedAt = input.updatedAt || new Date().toISOString();
  const { data } = await codexNovelRequest<ProgressPutResult>("/me/progress", {
    method: "PUT",
    auth: "user",
    body: {
      novelId: input.novelId,
      chapterNumber: input.chapterNumber,
      offsetRatio: input.offsetRatio,
      updatedAt,
      deviceName,
    },
  });
  return data;
}

export async function putCodexNovelProgressBatch(
  items: ProgressPutInput[],
): Promise<ProgressBatchResult> {
  const deviceName = (await getStoredDeviceName()) || "ReadAny";
  const payload = items.slice(0, 50).map((item) => ({
    novelId: item.novelId,
    chapterNumber: item.chapterNumber,
    offsetRatio: item.offsetRatio,
    updatedAt: item.updatedAt || new Date().toISOString(),
    deviceName: item.deviceName || deviceName,
  }));
  const { data } = await codexNovelRequest<ProgressBatchResult>("/me/progress/batch", {
    method: "POST",
    auth: "user",
    body: { items: payload },
  });
  return data;
}

export async function loadProgressQueue(): Promise<ProgressQueueItem[]> {
  const raw = await getPlatformService().kvGetItem(QUEUE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as ProgressQueueItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveProgressQueue(items: ProgressQueueItem[]): Promise<void> {
  await getPlatformService().kvSetItem(QUEUE_KEY, JSON.stringify(items));
}

/** Enqueue or replace by novelId (keep latest updatedAt). */
export async function enqueueProgress(item: ProgressPutInput): Promise<void> {
  const updatedAt = item.updatedAt || new Date().toISOString();
  const queue = await loadProgressQueue();
  const next: ProgressQueueItem = {
    novelId: item.novelId,
    chapterNumber: item.chapterNumber,
    offsetRatio: item.offsetRatio,
    updatedAt,
    deviceName: item.deviceName,
  };
  const idx = queue.findIndex((q) => q.novelId === next.novelId);
  if (idx >= 0) {
    const prev = queue[idx];
    if (Date.parse(prev.updatedAt) > Date.parse(next.updatedAt)) {
      // keep newer local queue item
    } else {
      queue[idx] = next;
    }
  } else {
    queue.push(next);
  }
  // sort oldest first for flush
  queue.sort((a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt));
  await saveProgressQueue(queue);
}

/**
 * Flush offline queue in batches of 50.
 * Removes items that applied or were rejected by LWW / NOT_FOUND; keeps network errors.
 */
export async function flushProgressQueue(): Promise<{
  flushed: number;
  remaining: number;
  error?: string;
}> {
  let queue = await loadProgressQueue();
  if (queue.length === 0) return { flushed: 0, remaining: 0 };

  let flushed = 0;
  try {
    while (queue.length > 0) {
      const batch = queue.slice(0, 50);
      const result = await putCodexNovelProgressBatch(batch);
      const keep = new Set<number>();
      for (const r of result.results || []) {
        if (r.error) {
          const code = (r.error.code || "").toUpperCase();
          // Drop permanent failures; keep transient for retry
          if (code === "NOT_FOUND" || code === "BAD_REQUEST") {
            // drop
          } else {
            keep.add(r.novelId);
          }
        }
        // applied true/false both drop (LWW settled)
      }
      // Also drop any novelId in batch that got a result without keep
      const batchIds = new Set(batch.map((b) => b.novelId));
      queue = queue.filter((item) => {
        if (!batchIds.has(item.novelId)) return true;
        if (keep.has(item.novelId)) return true;
        flushed += 1;
        return false;
      });
      await saveProgressQueue(queue);
      if (keep.size > 0) break; // avoid tight loop on persistent errors
    }
    return { flushed, remaining: queue.length };
  } catch (err) {
    return {
      flushed,
      remaining: queue.length,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Local-first save: always enqueue; try immediate put; on failure leave queue. */
export async function saveCodexNovelProgress(input: ProgressPutInput): Promise<void> {
  const updatedAt = input.updatedAt || new Date().toISOString();
  const payload = { ...input, updatedAt };
  await enqueueProgress(payload);
  try {
    await putCodexNovelProgress(payload);
    // remove this novel from queue on success
    const queue = await loadProgressQueue();
    await saveProgressQueue(queue.filter((q) => q.novelId !== payload.novelId));
  } catch {
    // stay queued
  }
}
