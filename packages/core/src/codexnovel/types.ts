/** CodexNovel `/api/v1` DTOs — aligned with codexnovel/docs/api-v1.md */

export type CodexNovelErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "REGISTER_DISABLED"
  | "RATE_LIMITED"
  | "INTERNAL"
  | "NETWORK"
  | "PARSE"
  | "CONFIG";

export interface CodexNovelApiErrorBody {
  error: {
    code: string;
    message: string;
  };
}

export interface CodexNovelUser {
  id: number;
  username: string;
  displayName: string;
}

export interface CodexNovelAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface CodexNovelAuthResponse extends CodexNovelAuthTokens {
  user: CodexNovelUser;
}

export interface CodexNovelHealth {
  status: string;
  apiVersion: number;
}

export interface CodexNovelBookSummary {
  id: number;
  title: string;
  author: string;
  description?: string;
  coverUrl?: string | null;
  status?: string;
  chapterCount?: number;
  lastChapterNumber?: number;
  lastChapterTitle?: string;
  updatedAt?: string;
}

export interface CodexNovelTocItem {
  id: number;
  chapterNumber: number;
  title: string;
  updatedAt?: string;
  contentHash?: string;
}

export interface CodexNovelTocPage {
  novelId: number;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  items: CodexNovelTocItem[];
}

export interface CodexNovelChapter {
  novelId: number;
  chapterId: number;
  chapterNumber: number;
  title: string;
  content: string;
  paragraphs: string[];
  contentHash: string;
  updatedAt: string;
  prev: number | null;
  next: number | null;
}

export interface CodexNovelProgress {
  novelId: number;
  chapterNumber: number;
  offsetRatio: number;
  updatedAt: string;
  deviceName?: string;
}

export interface CodexNovelShelfItem {
  novelId: number;
  title: string;
  author: string;
  coverUrl?: string | null;
  status?: string;
  lastChapterNumber?: number;
  lastChapterTitle?: string;
  novelUpdatedAt?: string;
  addedAt?: string;
  lastOpenedAt?: string | null;
  progress?: CodexNovelProgress | null;
  hasUpdate?: boolean;
}

export interface CodexNovelConfig {
  /** Origin only, e.g. https://example.com or http://127.0.0.1:3008 */
  baseUrl: string;
  /** Optional site access token for read-only content */
  siteAccessToken?: string;
  deviceName?: string;
  deviceId?: string;
}

export interface CodexNovelSession {
  user: CodexNovelUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  /** epoch ms when access token was stored (approx; used for UX only) */
  accessTokenStoredAt: number | null;
  expiresIn: number | null;
}

export const CODEXNOVEL_KV_PREFIX = "codexnovel.";
export const CODEXNOVEL_KV = {
  baseUrl: `${CODEXNOVEL_KV_PREFIX}baseUrl`,
  siteAccessToken: `${CODEXNOVEL_KV_PREFIX}siteAccessToken`,
  accessToken: `${CODEXNOVEL_KV_PREFIX}accessToken`,
  refreshToken: `${CODEXNOVEL_KV_PREFIX}refreshToken`,
  user: `${CODEXNOVEL_KV_PREFIX}user`,
  expiresIn: `${CODEXNOVEL_KV_PREFIX}expiresIn`,
  accessTokenStoredAt: `${CODEXNOVEL_KV_PREFIX}accessTokenStoredAt`,
  deviceName: `${CODEXNOVEL_KV_PREFIX}deviceName`,
  deviceId: `${CODEXNOVEL_KV_PREFIX}deviceId`,
} as const;
