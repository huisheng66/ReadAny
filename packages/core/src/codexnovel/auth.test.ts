import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IPlatformService } from "../services";
import { setPlatformService } from "../services";
import {
  configureCodexNovelBaseUrl,
  getCodexNovelHealth,
  loginCodexNovel,
  logoutCodexNovel,
} from "./auth";
import { CODEXNOVEL_KV } from "./types";

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

describe("auth helpers", () => {
  beforeEach(() => {
    setPlatformService(null as unknown as IPlatformService);
  });

  it("configureCodexNovelBaseUrl persists normalized URL", async () => {
    const kv = createMockPlatform(async () => new Response("{}"));
    const saved = await configureCodexNovelBaseUrl("http://127.0.0.1:3008/");
    expect(saved).toBe("http://127.0.0.1:3008");
    expect(kv.get(CODEXNOVEL_KV.baseUrl)).toBe("http://127.0.0.1:3008");
  });

  it("getCodexNovelHealth hits /health", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toContain("/api/v1/health");
      return new Response(JSON.stringify({ status: "ok", apiVersion: 1 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    createMockPlatform(fetchMock);
    const health = await getCodexNovelHealth("http://127.0.0.1:3008");
    expect(health).toEqual({ status: "ok", apiVersion: 1 });
  });

  it("loginCodexNovel stores session tokens", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          user: { id: 2, username: "bob", displayName: "Bob" },
          accessToken: "access-1",
          refreshToken: "refresh-1",
          expiresIn: 3600,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    const kv = createMockPlatform(fetchMock);
    const auth = await loginCodexNovel({
      username: "bob",
      password: "secret12",
      deviceName: "Test",
      baseUrl: "http://127.0.0.1:3008",
    });
    expect(auth.accessToken).toBe("access-1");
    expect(kv.get(CODEXNOVEL_KV.accessToken)).toBe("access-1");
    expect(kv.get(CODEXNOVEL_KV.refreshToken)).toBe("refresh-1");
    expect(kv.get(CODEXNOVEL_KV.deviceName)).toBe("Test");
    expect(JSON.parse(kv.get(CODEXNOVEL_KV.user)!).username).toBe("bob");
  });

  it("logoutCodexNovel clears local session", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    const kv = createMockPlatform(fetchMock);
    kv.set(CODEXNOVEL_KV.baseUrl, "http://127.0.0.1:3008");
    kv.set(CODEXNOVEL_KV.accessToken, "a");
    kv.set(CODEXNOVEL_KV.refreshToken, "r");
    kv.set(CODEXNOVEL_KV.user, "{}");

    await logoutCodexNovel();
    expect(kv.get(CODEXNOVEL_KV.accessToken)).toBeUndefined();
    expect(kv.get(CODEXNOVEL_KV.refreshToken)).toBeUndefined();
    expect(fetchMock).toHaveBeenCalled();
  });
});
