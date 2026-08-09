import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IPlatformService } from "../services";
import { setPlatformService } from "../services";
import { codexNovelRequest, tryRefreshAccessToken } from "./client";
import { CodexNovelError } from "./errors";
import { CODEXNOVEL_KV } from "./types";

type FetchImpl = (url: string, options?: RequestInit) => Promise<Response>;

function createMockPlatform(fetchImpl: FetchImpl, kv: Map<string, string> = new Map()) {
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

function jsonResponse(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) {
  const status = init.status ?? 200;
  const headers = new Headers(init.headers || {});
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify(body), { status, headers });
}

describe("codexNovelRequest", () => {
  beforeEach(() => {
    setPlatformService(null as unknown as IPlatformService);
  });

  it("throws CONFIG when base URL missing", async () => {
    createMockPlatform(async () => new Response("{}", { status: 200 }));
    await expect(codexNovelRequest("/health")).rejects.toMatchObject({ code: "CONFIG" });
  });

  it("GETs health without auth", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toBe("http://127.0.0.1:3008/api/v1/health");
      return jsonResponse({ status: "ok", apiVersion: 1 });
    });
    const kv = createMockPlatform(fetchMock);
    kv.set(CODEXNOVEL_KV.baseUrl, "http://127.0.0.1:3008");

    const res = await codexNovelRequest<{ status: string }>("/health", { auth: "none" });
    expect(res.data.status).toBe("ok");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("maps API error body to CodexNovelError", async () => {
    const kv = createMockPlatform(async () =>
      jsonResponse(
        { error: { code: "UNAUTHORIZED", message: "Access token required" } },
        { status: 401 },
      ),
    );
    kv.set(CODEXNOVEL_KV.baseUrl, "http://127.0.0.1:3008");

    await expect(codexNovelRequest("/me", { auth: "none", skipAuthRetry: true })).rejects.toEqual(
      expect.objectContaining({
        name: "CodexNovelError",
        code: "UNAUTHORIZED",
        message: "Access token required",
        httpStatus: 401,
      }),
    );
  });

  it("parses Retry-After on 429", async () => {
    const kv = createMockPlatform(async () =>
      jsonResponse(
        { error: { code: "RATE_LIMITED", message: "Too many requests" } },
        { status: 429, headers: { "Retry-After": "12" } },
      ),
    );
    kv.set(CODEXNOVEL_KV.baseUrl, "http://127.0.0.1:3008");

    try {
      await codexNovelRequest("/books", { auth: "none" });
      expect.fail("should throw");
    } catch (err) {
      expect(err).toBeInstanceOf(CodexNovelError);
      expect((err as CodexNovelError).code).toBe("RATE_LIMITED");
      expect((err as CodexNovelError).retryAfterSec).toBe(12);
    }
  });

  it("sends Bearer token for user auth", async () => {
    const fetchMock = vi.fn(async (_url: string, options?: RequestInit) => {
      const headers = new Headers(options?.headers as HeadersInit);
      expect(headers.get("Authorization")).toBe("Bearer jwt-abc");
      return jsonResponse({ id: 1, username: "alice", displayName: "Alice" });
    });
    const kv = createMockPlatform(fetchMock);
    kv.set(CODEXNOVEL_KV.baseUrl, "http://127.0.0.1:3008");
    kv.set(CODEXNOVEL_KV.accessToken, "jwt-abc");

    const res = await codexNovelRequest<{ username: string }>("/me", { auth: "user" });
    expect(res.data.username).toBe("alice");
  });

  it("refreshes once on 401 then retries", async () => {
    let meCalls = 0;
    const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
      if (url.endsWith("/auth/refresh")) {
        return jsonResponse({
          user: { id: 1, username: "alice", displayName: "Alice" },
          accessToken: "jwt-new",
          refreshToken: "refresh-new",
          expiresIn: 7200,
        });
      }
      if (url.endsWith("/me")) {
        meCalls += 1;
        const headers = new Headers(options?.headers as HeadersInit);
        if (headers.get("Authorization") === "Bearer jwt-old") {
          return jsonResponse(
            { error: { code: "UNAUTHORIZED", message: "expired" } },
            { status: 401 },
          );
        }
        expect(headers.get("Authorization")).toBe("Bearer jwt-new");
        return jsonResponse({ id: 1, username: "alice", displayName: "Alice" });
      }
      return jsonResponse({ error: { code: "NOT_FOUND", message: "no" } }, { status: 404 });
    });

    const kv = createMockPlatform(fetchMock);
    kv.set(CODEXNOVEL_KV.baseUrl, "http://127.0.0.1:3008");
    kv.set(CODEXNOVEL_KV.accessToken, "jwt-old");
    kv.set(CODEXNOVEL_KV.refreshToken, "refresh-old");

    const res = await codexNovelRequest<{ username: string }>("/me", { auth: "user" });
    expect(res.data.username).toBe("alice");
    expect(meCalls).toBe(2);
    expect(kv.get(CODEXNOVEL_KV.accessToken)).toBe("jwt-new");
  });

  it("returns 304 without body for If-None-Match hit", async () => {
    const kv = createMockPlatform(
      async () => new Response(null, { status: 304, headers: { ETag: '"abc"' } }),
    );
    kv.set(CODEXNOVEL_KV.baseUrl, "http://127.0.0.1:3008");
    kv.set(CODEXNOVEL_KV.accessToken, "jwt");

    const res = await codexNovelRequest("/books/1/chapters/1", {
      auth: "user",
      ifNoneMatch: "abc",
    });
    expect(res.status).toBe(304);
    expect(res.etag).toBe('"abc"');
  });
});

describe("tryRefreshAccessToken", () => {
  beforeEach(() => {
    setPlatformService(null as unknown as IPlatformService);
  });

  it("returns false when no refresh token", async () => {
    const kv = createMockPlatform(async () => jsonResponse({}));
    kv.set(CODEXNOVEL_KV.baseUrl, "http://127.0.0.1:3008");
    expect(await tryRefreshAccessToken()).toBe(false);
  });
});
