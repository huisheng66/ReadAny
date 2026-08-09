import { getPlatformService } from "../services/platform";
import type { FetchOptions } from "../services/platform";
import { buildCodexNovelApiUrl } from "./config";
import { CodexNovelError, mapHttpStatusToCode, parseRetryAfter } from "./errors";
import {
  clearSession,
  getStoredBaseUrl,
  getStoredSiteAccessToken,
  loadSession,
  saveSession,
  updateAccessToken,
} from "./token-store";
import type { CodexNovelApiErrorBody, CodexNovelAuthResponse } from "./types";

export type CodexNovelAuthMode = "none" | "user" | "site" | "user-or-site";

export interface CodexNovelRequestOptions {
  method?: string;
  body?: unknown;
  /** Query string without leading ? */
  query?: Record<string, string | number | boolean | undefined | null>;
  auth?: CodexNovelAuthMode;
  /** If-None-Match value (contentHash / ETag) */
  ifNoneMatch?: string;
  headers?: Record<string, string>;
  /** Skip single 401→refresh retry (used by refresh itself) */
  skipAuthRetry?: boolean;
  /** Override base URL for this request */
  baseUrl?: string;
  timeoutMs?: number;
}

export interface CodexNovelResponse<T> {
  data: T;
  status: number;
  etag: string | null;
  headers: Headers;
}

function buildQuery(query?: CodexNovelRequestOptions["query"]): string {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    params.set(key, String(value));
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

async function resolveBaseUrl(override?: string): Promise<string> {
  if (override?.trim()) return override.trim();
  const stored = await getStoredBaseUrl();
  if (!stored) {
    throw new CodexNovelError("CONFIG", "CodexNovel base URL is not configured");
  }
  return stored;
}

async function buildAuthHeaders(mode: CodexNovelAuthMode): Promise<Record<string, string>> {
  if (mode === "none") return {};
  const headers: Record<string, string> = {};
  const session = await loadSession();
  const siteToken = await getStoredSiteAccessToken();

  if (mode === "user" || mode === "user-or-site") {
    if (session.accessToken) {
      headers.Authorization = `Bearer ${session.accessToken}`;
    } else if (mode === "user") {
      throw new CodexNovelError("UNAUTHORIZED", "Not logged in");
    }
  }

  if (mode === "site" || (mode === "user-or-site" && !headers.Authorization)) {
    if (siteToken) {
      headers["X-Access-Token"] = siteToken;
    } else if (mode === "site") {
      throw new CodexNovelError("UNAUTHORIZED", "Site access token required");
    } else if (!headers.Authorization) {
      throw new CodexNovelError("UNAUTHORIZED", "Login or site access token required");
    }
  }

  return headers;
}

let refreshInFlight: Promise<boolean> | null = null;

/**
 * Try refresh once. Returns true if a new access token was stored.
 */
export async function tryRefreshAccessToken(baseUrl?: string): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const session = await loadSession();
    if (!session.refreshToken) return false;

    try {
      const origin = await resolveBaseUrl(baseUrl);
      const url = buildCodexNovelApiUrl(origin, "/auth/refresh");
      const platform = getPlatformService();
      const res = await platform.fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ refreshToken: session.refreshToken }),
      });

      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          await clearSession();
        }
        return false;
      }

      const data = (await res.json()) as CodexNovelAuthResponse;
      if (!data.accessToken) return false;

      if (data.refreshToken && data.user) {
        await saveSession({
          user: data.user,
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          expiresIn: data.expiresIn ?? 7200,
        });
      } else {
        await updateAccessToken(data.accessToken, data.expiresIn);
        if (data.refreshToken) {
          const { CODEXNOVEL_KV } = await import("./types");
          await getPlatformService().kvSetItem(CODEXNOVEL_KV.refreshToken, data.refreshToken);
        }
      }
      return true;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();

  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

export async function codexNovelRequest<T>(
  path: string,
  options: CodexNovelRequestOptions = {},
): Promise<CodexNovelResponse<T>> {
  const method = (options.method || "GET").toUpperCase();
  const authMode = options.auth ?? "none";
  const origin = await resolveBaseUrl(options.baseUrl);
  const url = buildCodexNovelApiUrl(origin, `${path}${buildQuery(options.query)}`);

  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(options.headers || {}),
  };

  if (options.body !== undefined && method !== "GET" && method !== "HEAD") {
    headers["Content-Type"] = headers["Content-Type"] || "application/json";
  }

  Object.assign(headers, await buildAuthHeaders(authMode));

  if (options.ifNoneMatch) {
    headers["If-None-Match"] = options.ifNoneMatch.includes('"')
      ? options.ifNoneMatch
      : `"${options.ifNoneMatch}"`;
  }

  const fetchOpts: FetchOptions = {
    method,
    headers,
    timeoutMs: options.timeoutMs,
  };
  if (options.body !== undefined && method !== "GET" && method !== "HEAD") {
    fetchOpts.body =
      typeof options.body === "string" ? options.body : JSON.stringify(options.body);
  }

  let response: Response;
  try {
    response = await getPlatformService().fetch(url, fetchOpts);
  } catch (err) {
    throw new CodexNovelError("NETWORK", err instanceof Error ? err.message : "Network error", {
      cause: err,
    });
  }

  // 401 → refresh once for user-auth requests
  if (
    response.status === 401 &&
    !options.skipAuthRetry &&
    (authMode === "user" || authMode === "user-or-site")
  ) {
    const refreshed = await tryRefreshAccessToken(origin);
    if (refreshed) {
      return codexNovelRequest<T>(path, { ...options, skipAuthRetry: true });
    }
  }

  if (response.status === 304) {
    return {
      data: undefined as T,
      status: 304,
      etag: response.headers.get("ETag"),
      headers: response.headers,
    };
  }

  const text = await response.text();
  let parsed: unknown = undefined;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      if (!response.ok) {
        throw new CodexNovelError("PARSE", `Non-JSON error response (${response.status})`, {
          httpStatus: response.status,
        });
      }
      throw new CodexNovelError("PARSE", "Failed to parse JSON response");
    }
  }

  if (!response.ok) {
    const body = parsed as CodexNovelApiErrorBody | undefined;
    const apiCode = body?.error?.code;
    const message = body?.error?.message || response.statusText || `HTTP ${response.status}`;
    const code = mapHttpStatusToCode(response.status, apiCode);
    throw new CodexNovelError(code, message, {
      httpStatus: response.status,
      retryAfterSec:
        response.status === 429 ? parseRetryAfter(response.headers.get("Retry-After")) : undefined,
    });
  }

  return {
    data: parsed as T,
    status: response.status,
    etag: response.headers.get("ETag"),
    headers: response.headers,
  };
}
