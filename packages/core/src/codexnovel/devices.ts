import { codexNovelRequest } from "./client";
import {
  getStoredDeviceId,
  getStoredDeviceName,
  setStoredDeviceId,
  setStoredDeviceName,
} from "./token-store";

export interface CodexNovelDevice {
  id?: number;
  deviceId: string;
  platform?: string;
  pushToken?: string | null;
  enabled?: boolean;
}

function randomDeviceId(): string {
  return `readany-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

export async function ensureCodexNovelDeviceId(): Promise<string> {
  let id = await getStoredDeviceId();
  if (!id) {
    id = randomDeviceId();
    await setStoredDeviceId(id);
  }
  return id;
}

export async function registerCodexNovelDevice(options?: {
  platform?: string;
  pushToken?: string;
  enabled?: boolean;
  deviceName?: string;
}): Promise<CodexNovelDevice> {
  const deviceId = await ensureCodexNovelDeviceId();
  if (options?.deviceName) {
    await setStoredDeviceName(options.deviceName);
  }
  const { data } = await codexNovelRequest<CodexNovelDevice>("/me/devices", {
    method: "POST",
    auth: "user",
    body: {
      deviceId,
      platform: options?.platform || "desktop",
      pushToken: options?.pushToken,
      enabled: options?.enabled ?? true,
    },
  });
  return data;
}

export async function listCodexNovelDevices(): Promise<CodexNovelDevice[]> {
  const { data } = await codexNovelRequest<{ items?: CodexNovelDevice[] } | CodexNovelDevice[]>(
    "/me/devices",
    { auth: "user" },
  );
  if (Array.isArray(data)) return data;
  return data.items || [];
}

export interface UpdateNotice {
  type?: string;
  novelId?: number;
  title?: string;
  newChapterCount?: number;
  message?: string;
  [key: string]: unknown;
}

export async function listCodexNovelUpdateNotices(since: string): Promise<{
  since: string;
  serverTime?: string;
  items: UpdateNotice[];
}> {
  const { data } = await codexNovelRequest<{
    since: string;
    serverTime?: string;
    items?: UpdateNotice[];
  }>("/me/notices/updates", {
    auth: "user",
    query: { since },
  });
  return { since: data.since, serverTime: data.serverTime, items: data.items || [] };
}

export async function getPreferredDeviceName(): Promise<string> {
  return (await getStoredDeviceName()) || "ReadAny";
}
