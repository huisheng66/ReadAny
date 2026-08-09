import { codexNovelRequest } from "./client";
import { getPlatformService } from "../services/platform";
import { CODEXNOVEL_KV_PREFIX } from "./types";

export interface CodexNovelOps {
  announcement?: {
    enabled?: boolean;
    text?: string;
  };
  updatePolicy?: {
    minClientVersion?: string;
    forceUpdate?: boolean;
    message?: string;
    storeUrl?: string;
  };
  serverTime?: string;
  updatedAt?: string;
}

const OPS_CACHE_KEY = `${CODEXNOVEL_KV_PREFIX}opsCache`;

export async function getCodexNovelOps(baseUrl?: string): Promise<CodexNovelOps> {
  const { data } = await codexNovelRequest<CodexNovelOps>("/ops", {
    auth: "none",
    baseUrl,
  });
  try {
    await getPlatformService().kvSetItem(OPS_CACHE_KEY, JSON.stringify({ at: Date.now(), data }));
  } catch {
    // ignore
  }
  return data;
}

export async function getCachedCodexNovelOps(): Promise<CodexNovelOps | null> {
  try {
    const raw = await getPlatformService().kvGetItem(OPS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { data?: CodexNovelOps };
    return parsed.data || null;
  } catch {
    return null;
  }
}

/** Compare semver-ish strings: a > b → 1, a < b → -1, eq → 0 */
export function compareSemver(a: string, b: string): number {
  const pa = a.replace(/^v/i, "").split(".").map((x) => Number.parseInt(x, 10) || 0);
  const pb = b.replace(/^v/i, "").split(".").map((x) => Number.parseInt(x, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const da = pa[i] || 0;
    const db = pb[i] || 0;
    if (da > db) return 1;
    if (da < db) return -1;
  }
  return 0;
}

export interface OpsCheckResult {
  ops: CodexNovelOps;
  announcementText: string | null;
  needsUpdate: boolean;
  forceUpdate: boolean;
  updateMessage: string | null;
  storeUrl: string | null;
}

export async function checkCodexNovelClientOps(
  currentVersion: string,
  baseUrl?: string,
): Promise<OpsCheckResult> {
  let ops: CodexNovelOps;
  try {
    ops = await getCodexNovelOps(baseUrl);
  } catch {
    ops = (await getCachedCodexNovelOps()) || {};
  }

  const policy = ops.updatePolicy || {};
  const min = policy.minClientVersion || "";
  const needsUpdate = min ? compareSemver(currentVersion, min) < 0 : false;
  const forceUpdate = Boolean(policy.forceUpdate && needsUpdate);
  const announcementText =
    ops.announcement?.enabled && ops.announcement.text ? ops.announcement.text : null;

  return {
    ops,
    announcementText,
    needsUpdate,
    forceUpdate,
    updateMessage: policy.message || null,
    storeUrl: policy.storeUrl || null,
  };
}
