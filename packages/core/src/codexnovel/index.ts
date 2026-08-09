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

export {
  listCodexNovelBooks,
  getCodexNovelBook,
  getCodexNovelToc,
  getCodexNovelChapter,
  type ListBooksParams,
  type ListBooksResult,
  type GetChapterResult,
} from "./books";
export {
  listCodexNovelShelf,
  addCodexNovelToShelf,
  removeCodexNovelFromShelf,
  listCodexNovelShelfUpdates,
  type ListShelfResult,
  type ShelfUpdatesResult,
} from "./shelf";
export {
  CODEXNOVEL_BOOK_ID_PREFIX,
  CODEXNOVEL_FILE_SCHEME,
  CODEXNOVEL_TAG,
  toLocalCodexNovelBookId,
  parseCodexNovelBookId,
  isCodexNovelBookId,
  isCodexNovelBook,
  codexNovelFilePath,
  encodeCodexNovelCfi,
  decodeCodexNovelCfi,
  progressRatioFromChapter,
  bookFromCodexNovelSummary,
  bookFromCodexNovelShelfItem,
  type CodexNovelLocalMeta,
} from "./mapping";
export {
  ensureCodexNovelMetaTable,
  upsertCodexNovelLocalMeta,
  getCodexNovelLocalMetaByNovelId,
  getCodexNovelLocalMetaByBookId,
  listCodexNovelLocalMeta,
  deleteCodexNovelLocalMeta,
} from "./local-meta";
export {
  syncCodexNovelShelfToLibrary,
  removeCodexNovelFromLocalLibrary,
  ensureCodexNovelBookReady,
  type SyncShelfResult,
} from "./shelf-sync";
export {
  readChapterCache,
  writeChapterCache,
  invalidateChapterCache,
  type CachedChapter,
} from "./cache";
export {
  getCodexNovelProgress,
  putCodexNovelProgress,
  putCodexNovelProgressBatch,
  loadProgressQueue,
  enqueueProgress,
  flushProgressQueue,
  saveCodexNovelProgress,
  type ProgressPutInput,
  type ProgressPutResult,
  type ProgressBatchResult,
  type ProgressQueueItem,
} from "./progress";
export { loadCodexNovelChapter, type LoadedChapter } from "./chapter-loader";
export {
  getCodexNovelTocDelta,
  checkCodexNovelShelfUpdates,
  applyCodexNovelTocDelta,
  listLocalUpdateBadges,
  getLastShelfCheckAt,
  setLastShelfCheckAt,
  cacheTocPage,
  type TocDeltaResult,
  type ShelfCheckResult,
} from "./updates";
export {
  listCodexNovelBookmarks,
  createCodexNovelBookmark,
  updateCodexNovelBookmark,
  deleteCodexNovelBookmark,
  type CodexNovelBookmark,
} from "./bookmarks";
export {
  getCodexNovelOps,
  getCachedCodexNovelOps,
  compareSemver,
  checkCodexNovelClientOps,
  type CodexNovelOps,
  type OpsCheckResult,
} from "./ops";
export {
  ensureCodexNovelDeviceId,
  registerCodexNovelDevice,
  listCodexNovelDevices,
  listCodexNovelUpdateNotices,
  getPreferredDeviceName,
  type CodexNovelDevice,
  type UpdateNotice,
} from "./devices";
