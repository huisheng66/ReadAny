import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IPlatformService } from "../services";
import { setPlatformService } from "../services";
import { enqueueProgress, flushProgressQueue, loadProgressQueue } from "./progress";
import { CODEXNOVEL_KV } from "./types";
import { CODEXNOVEL_KV_PREFIX } from "./types";

const QUEUE_KEY = `${CODEXNOVEL_KV_PREFIX}progressQueue`;

function createMockPlatform(
  fetchImpl: (url: string, options?: RequestInit) => Promise<Response>,
  kv: Map<string, string> = new Map(),
) {
  setPlatformService({
    platformType: "desktop",
    isDesktop: true,
    isMobile: false,
    async readFile() {
      throw new Error("not used");
    },
    async writeFile() {
      throw new Error("not used");
    },
    async writeTextFile() {
      throw new Error("not used");
    },
    async readTextFile() {
      throw new Error("not used");
    },
    async mkdir() {},
    async exists() {
      return false;
    },
    async deleteFile() {},
    async getAppDataDir() {
      return "/tmp";
    },
    async getDataDir() {
      return "/tmp";
    },
    async joinPath(...parts) {
      return parts.join("/");
    },
    convertFileSrc(path) {
      return path;
    },
    async pickFile() {
      return null;
    },
    async loadDatabase() {
      throw new Error("not used");
    },
    fetch: fetchImpl as IPlatformService["fetch"],
    async createWebSocket() {
      throw new Error("not used");
    },
    async getAppVersion() {
      return "1.0.0";
    },
    async kvGetItem(key) {
      return kv.get(key) ?? null;
    },
    async kvSetItem(key, value) {
      kv.set(key, value);
    },
    async kvRemoveItem(key) {
      kv.delete(key);
    },
    async kvGetAllKeys() {
      return [...kv.keys()];
    },
    async copyToClipboard() {},
    async shareOrDownloadFile() {
      return null;
    },
  } as IPlatformService);
  return kv;
}

describe("progress queue", () => {
  beforeEach(() => {
    setPlatformService(null as unknown as IPlatformService);
  });

  it("keeps latest item per novelId", async () => {
    const kv = createMockPlatform(async () => new Response("{}"));
    await enqueueProgress({
      novelId: 1,
      chapterNumber: 1,
      offsetRatio: 0.1,
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    await enqueueProgress({
      novelId: 1,
      chapterNumber: 2,
      offsetRatio: 0.5,
      updatedAt: "2026-01-02T00:00:00.000Z",
    });
    const queue = await loadProgressQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0].chapterNumber).toBe(2);
    expect(kv.get(QUEUE_KEY)).toContain('"chapterNumber":2');
  });

  it("flushes batch and clears applied items", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          appliedCount: 1,
          skippedCount: 0,
          errorCount: 0,
          serverTime: "2026-01-03T00:00:00.000Z",
          results: [{ novelId: 10, applied: true, progress: { novelId: 10, chapterNumber: 3, offsetRatio: 0.2, updatedAt: "2026-01-03T00:00:00.000Z" } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    const kv = createMockPlatform(fetchMock);
    kv.set(CODEXNOVEL_KV.baseUrl, "http://127.0.0.1:3008");
    kv.set(CODEXNOVEL_KV.accessToken, "jwt");
    await enqueueProgress({
      novelId: 10,
      chapterNumber: 3,
      offsetRatio: 0.2,
      updatedAt: "2026-01-03T00:00:00.000Z",
    });

    const result = await flushProgressQueue();
    expect(result.flushed).toBe(1);
    expect(result.remaining).toBe(0);
    expect(fetchMock).toHaveBeenCalled();
  });
});
