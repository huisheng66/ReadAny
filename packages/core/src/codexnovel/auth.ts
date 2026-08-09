import { normalizeCodexNovelBaseUrl } from "./config";
import { codexNovelRequest } from "./client";
import {
  clearSession,
  loadSession,
  saveSession,
  setStoredBaseUrl,
  setStoredDeviceName,
} from "./token-store";
import type {
  CodexNovelAuthResponse,
  CodexNovelHealth,
  CodexNovelSession,
  CodexNovelUser,
} from "./types";

export interface LoginInput {
  username: string;
  password: string;
  deviceName?: string;
  baseUrl?: string;
}

export interface RegisterInput extends LoginInput {
  displayName?: string;
  /** 一次一码邀请码（服务端必填） */
  inviteCode?: string;
}

export async function configureCodexNovelBaseUrl(baseUrl: string): Promise<string> {
  const normalized = normalizeCodexNovelBaseUrl(baseUrl);
  await setStoredBaseUrl(normalized);
  return normalized;
}

export async function getCodexNovelHealth(baseUrl?: string): Promise<CodexNovelHealth> {
  const { data } = await codexNovelRequest<CodexNovelHealth>("/health", {
    auth: "none",
    baseUrl,
  });
  return data;
}

export async function registerCodexNovel(input: RegisterInput): Promise<CodexNovelAuthResponse> {
  const username = String(input.username || "").trim();
  const password = String(input.password || "");
  if (!/^[a-zA-Z0-9_]{3,32}$/.test(username)) {
    const { CodexNovelError } = await import("./errors");
    throw new CodexNovelError(
      "BAD_REQUEST",
      "用户名须 3–32 位：仅字母、数字、下划线（不能用中文/邮箱）",
    );
  }
  if (password.length < 8) {
    const { CodexNovelError } = await import("./errors");
    throw new CodexNovelError("BAD_REQUEST", "密码至少 8 位");
  }
  const inviteCode = String(input.inviteCode || "").trim();
  if (!inviteCode) {
    const { CodexNovelError } = await import("./errors");
    throw new CodexNovelError("BAD_REQUEST", "请填写邀请码（一次一码，向管理员索取）");
  }

  if (input.baseUrl) {
    await configureCodexNovelBaseUrl(input.baseUrl);
  }
  if (input.deviceName) {
    await setStoredDeviceName(input.deviceName);
  }

  const { data } = await codexNovelRequest<CodexNovelAuthResponse>("/auth/register", {
    method: "POST",
    auth: "none",
    body: {
      username,
      password,
      displayName: input.displayName || username,
      inviteCode,
    },
    baseUrl: input.baseUrl,
  });

  if (!data?.accessToken || !data?.user) {
    const { CodexNovelError } = await import("./errors");
    throw new CodexNovelError("PARSE", "注册响应缺少 token，请检查服务器 /api/v1");
  }

  await saveSession({
    user: data.user,
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    expiresIn: data.expiresIn ?? 7200,
  });
  return data;
}

export async function loginCodexNovel(input: LoginInput): Promise<CodexNovelAuthResponse> {
  const username = String(input.username || "").trim();
  const password = String(input.password || "");
  if (!username || !password) {
    const { CodexNovelError } = await import("./errors");
    throw new CodexNovelError("BAD_REQUEST", "请填写用户名和密码");
  }

  if (input.baseUrl) {
    await configureCodexNovelBaseUrl(input.baseUrl);
  }
  if (input.deviceName) {
    await setStoredDeviceName(input.deviceName);
  }

  const { data } = await codexNovelRequest<CodexNovelAuthResponse>("/auth/login", {
    method: "POST",
    auth: "none",
    body: {
      username,
      password,
      deviceName: input.deviceName,
    },
    baseUrl: input.baseUrl,
  });

  if (!data?.accessToken || !data?.user) {
    const { CodexNovelError } = await import("./errors");
    throw new CodexNovelError("PARSE", "登录响应缺少 token，请检查服务器 /api/v1");
  }

  await saveSession({
    user: data.user,
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    expiresIn: data.expiresIn ?? 7200,
  });
  return data;
}

export async function logoutCodexNovel(): Promise<void> {
  const session = await loadSession();
  if (session.refreshToken) {
    try {
      await codexNovelRequest("/auth/logout", {
        method: "POST",
        auth: "none",
        body: { refreshToken: session.refreshToken },
        skipAuthRetry: true,
      });
    } catch {
      // still clear local session
    }
  }
  await clearSession();
}

export async function getCodexNovelMe(): Promise<CodexNovelUser> {
  // Server returns `{ user: {...} }` (see routes/api/v1/index.js)
  const { data } = await codexNovelRequest<CodexNovelUser | { user: CodexNovelUser }>("/me", {
    auth: "user",
  });
  if (data && typeof data === "object" && "user" in data && data.user) {
    return data.user;
  }
  return data as CodexNovelUser;
}

export async function getCodexNovelSession(): Promise<CodexNovelSession> {
  return loadSession();
}

export async function isCodexNovelLoggedIn(): Promise<boolean> {
  const session = await loadSession();
  return Boolean(session.accessToken);
}
