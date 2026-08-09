import { CodexNovelError } from "./errors";

const API_PREFIX = "/api/v1";

/**
 * Normalize user-entered server origin.
 * Accepts `http://host:port`, with or without trailing slash, with or without `/api/v1`.
 */
export function normalizeCodexNovelBaseUrl(input: string): string {
  const raw = (input || "").trim();
  if (!raw) {
    throw new CodexNovelError("CONFIG", "CodexNovel base URL is required");
  }

  let withProtocol = raw;
  if (!/^https?:\/\//i.test(withProtocol)) {
    withProtocol = `http://${withProtocol}`;
  }

  let url: URL;
  try {
    url = new URL(withProtocol);
  } catch {
    throw new CodexNovelError("CONFIG", `Invalid CodexNovel base URL: ${input}`);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new CodexNovelError("CONFIG", "CodexNovel base URL must use http or https");
  }

  // Strip trailing /api/v1 if user pasted full API root
  let path = url.pathname.replace(/\/+$/, "");
  if (path.toLowerCase().endsWith("/api/v1")) {
    path = path.slice(0, -"/api/v1".length);
  }
  path = path.replace(/\/+$/, "");

  const origin = `${url.protocol}//${url.host}${path}`;
  return origin.replace(/\/+$/, "");
}

/** Build absolute URL for an API path like `/health` or `books?q=a`. */
export function buildCodexNovelApiUrl(baseUrl: string, path: string): string {
  const origin = normalizeCodexNovelBaseUrl(baseUrl);
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  // Avoid double /api/v1 if caller already included it
  if (cleanPath === API_PREFIX || cleanPath.startsWith(`${API_PREFIX}/`)) {
    return `${origin}${cleanPath}`;
  }
  return `${origin}${API_PREFIX}${cleanPath}`;
}

export function getCodexNovelApiPrefix(): string {
  return API_PREFIX;
}
