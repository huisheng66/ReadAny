import { getPlatformService } from "../services/platform";
import type { CodexNovelSession, CodexNovelUser } from "./types";
import { CODEXNOVEL_KV } from "./types";

async function kvGet(key: string): Promise<string | null> {
  return getPlatformService().kvGetItem(key);
}

async function kvSet(key: string, value: string): Promise<void> {
  await getPlatformService().kvSetItem(key, value);
}

async function kvRemove(key: string): Promise<void> {
  await getPlatformService().kvRemoveItem(key);
}

export async function getStoredBaseUrl(): Promise<string | null> {
  return kvGet(CODEXNOVEL_KV.baseUrl);
}

export async function setStoredBaseUrl(baseUrl: string): Promise<void> {
  await kvSet(CODEXNOVEL_KV.baseUrl, baseUrl);
}

export async function getStoredSiteAccessToken(): Promise<string | null> {
  return kvGet(CODEXNOVEL_KV.siteAccessToken);
}

export async function setStoredSiteAccessToken(token: string | null): Promise<void> {
  if (!token) {
    await kvRemove(CODEXNOVEL_KV.siteAccessToken);
    return;
  }
  await kvSet(CODEXNOVEL_KV.siteAccessToken, token);
}

export async function getStoredDeviceName(): Promise<string | null> {
  return kvGet(CODEXNOVEL_KV.deviceName);
}

export async function setStoredDeviceName(name: string): Promise<void> {
  await kvSet(CODEXNOVEL_KV.deviceName, name);
}

export async function getStoredDeviceId(): Promise<string | null> {
  return kvGet(CODEXNOVEL_KV.deviceId);
}

export async function setStoredDeviceId(id: string): Promise<void> {
  await kvSet(CODEXNOVEL_KV.deviceId, id);
}

export async function loadSession(): Promise<CodexNovelSession> {
  const [accessToken, refreshToken, userRaw, expiresInRaw, storedAtRaw] = await Promise.all([
    kvGet(CODEXNOVEL_KV.accessToken),
    kvGet(CODEXNOVEL_KV.refreshToken),
    kvGet(CODEXNOVEL_KV.user),
    kvGet(CODEXNOVEL_KV.expiresIn),
    kvGet(CODEXNOVEL_KV.accessTokenStoredAt),
  ]);

  let user: CodexNovelUser | null = null;
  if (userRaw) {
    try {
      user = JSON.parse(userRaw) as CodexNovelUser;
    } catch {
      user = null;
    }
  }

  return {
    user,
    accessToken,
    refreshToken,
    expiresIn: expiresInRaw ? Number.parseInt(expiresInRaw, 10) || null : null,
    accessTokenStoredAt: storedAtRaw ? Number.parseInt(storedAtRaw, 10) || null : null,
  };
}

export async function saveSession(session: {
  user: CodexNovelUser;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}): Promise<void> {
  await Promise.all([
    kvSet(CODEXNOVEL_KV.accessToken, session.accessToken),
    kvSet(CODEXNOVEL_KV.refreshToken, session.refreshToken),
    kvSet(CODEXNOVEL_KV.user, JSON.stringify(session.user)),
    kvSet(CODEXNOVEL_KV.expiresIn, String(session.expiresIn)),
    kvSet(CODEXNOVEL_KV.accessTokenStoredAt, String(Date.now())),
  ]);
}

export async function clearSession(): Promise<void> {
  await Promise.all([
    kvRemove(CODEXNOVEL_KV.accessToken),
    kvRemove(CODEXNOVEL_KV.refreshToken),
    kvRemove(CODEXNOVEL_KV.user),
    kvRemove(CODEXNOVEL_KV.expiresIn),
    kvRemove(CODEXNOVEL_KV.accessTokenStoredAt),
  ]);
}

export async function updateAccessToken(accessToken: string, expiresIn?: number): Promise<void> {
  await kvSet(CODEXNOVEL_KV.accessToken, accessToken);
  await kvSet(CODEXNOVEL_KV.accessTokenStoredAt, String(Date.now()));
  if (expiresIn !== undefined) {
    await kvSet(CODEXNOVEL_KV.expiresIn, String(expiresIn));
  }
}
