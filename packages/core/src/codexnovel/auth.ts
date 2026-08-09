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
      username: input.username,
      password: input.password,
      displayName: input.displayName,
    },
    baseUrl: input.baseUrl,
  });

  await saveSession({
    user: data.user,
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    expiresIn: data.expiresIn ?? 7200,
  });
  return data;
}

export async function loginCodexNovel(input: LoginInput): Promise<CodexNovelAuthResponse> {
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
      username: input.username,
      password: input.password,
      deviceName: input.deviceName,
    },
    baseUrl: input.baseUrl,
  });

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
  const { data } = await codexNovelRequest<CodexNovelUser>("/me", { auth: "user" });
  return data;
}

export async function getCodexNovelSession(): Promise<CodexNovelSession> {
  return loadSession();
}

export async function isCodexNovelLoggedIn(): Promise<boolean> {
  const session = await loadSession();
  return Boolean(session.accessToken);
}
