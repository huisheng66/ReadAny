/**
 * CodexNovel online library client (`/api/v1`).
 * Platform-agnostic: uses IPlatformService.fetch + kv storage.
 */

export { CodexNovelError, mapHttpStatusToCode, parseRetryAfter } from "./errors";
export {
  normalizeCodexNovelBaseUrl,
  buildCodexNovelApiUrl,
  getCodexNovelApiPrefix,
} from "./config";
export {
  codexNovelRequest,
  tryRefreshAccessToken,
  type CodexNovelAuthMode,
  type CodexNovelRequestOptions,
  type CodexNovelResponse,
} from "./client";
export {
  configureCodexNovelBaseUrl,
  getCodexNovelHealth,
  registerCodexNovel,
  loginCodexNovel,
  logoutCodexNovel,
  getCodexNovelMe,
  getCodexNovelSession,
  isCodexNovelLoggedIn,
  type LoginInput,
  type RegisterInput,
} from "./auth";
export {
  loadSession,
  saveSession,
  clearSession,
  getStoredBaseUrl,
  setStoredBaseUrl,
  getStoredSiteAccessToken,
  setStoredSiteAccessToken,
  getStoredDeviceName,
  setStoredDeviceName,
  getStoredDeviceId,
  setStoredDeviceId,
  updateAccessToken,
} from "./token-store";
export type {
  CodexNovelErrorCode,
  CodexNovelApiErrorBody,
  CodexNovelUser,
  CodexNovelAuthTokens,
  CodexNovelAuthResponse,
  CodexNovelHealth,
  CodexNovelBookSummary,
  CodexNovelTocItem,
  CodexNovelTocPage,
  CodexNovelChapter,
  CodexNovelProgress,
  CodexNovelShelfItem,
  CodexNovelConfig,
  CodexNovelSession,
} from "./types";
export { CODEXNOVEL_KV, CODEXNOVEL_KV_PREFIX } from "./types";
