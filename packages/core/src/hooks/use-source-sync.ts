/**
 * useSourceSync — periodically checks WebDAV novel sources for book updates.
 *
 * Mirrors the use-auto-sync lifecycle: load config → delay after startup →
 * run a check → reschedule with jitter. Exposes `checkNow` for manual triggers
 * (e.g. from a book card menu) and `isChecking`/`lastResult` for UI state.
 *
 * @param onBooksUpdated Optional callback fired when one or more books were
 *   refreshed (typically reloads the library so covers/metadata stay fresh).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { getPlatformService } from "../services/platform";
import {
  SourceSyncService,
  type SourceUpdateResult,
} from "../source/source-sync-service";

const SOURCE_SYNC_CONFIG_KEY = "source_sync_config";
const DEFAULT_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
const STARTUP_DELAY_MS = 15_000;

export interface SourceSyncConfig {
  autoCheck: boolean;
  intervalMs: number;
}

async function loadConfig(): Promise<SourceSyncConfig> {
  try {
    const platform = getPlatformService();
    const raw = await platform.kvGetItem(SOURCE_SYNC_CONFIG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SourceSyncConfig>;
      return {
        autoCheck: parsed.autoCheck ?? true,
        intervalMs: parsed.intervalMs ?? DEFAULT_INTERVAL_MS,
      };
    }
  } catch (err) {
    console.warn("[SourceSync] Failed to load config:", err);
  }
  return { autoCheck: true, intervalMs: DEFAULT_INTERVAL_MS };
}

function withJitter(baseMs: number): number {
  const jitter = Math.floor(Math.random() * Math.min(60_000, Math.floor(baseMs * 0.1)));
  return baseMs + jitter;
}

export function useSourceSync(onBooksUpdated?: (results: SourceUpdateResult[]) => void) {
  const [isChecking, setIsChecking] = useState(false);
  const [lastResult, setLastResult] = useState<SourceUpdateResult[] | null>(null);

  const serviceRef = useRef<SourceSyncService | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isCheckingRef = useRef(false);
  const onBooksUpdatedRef = useRef(onBooksUpdated);
  onBooksUpdatedRef.current = onBooksUpdated;

  const getService = useCallback(() => {
    if (!serviceRef.current) serviceRef.current = new SourceSyncService();
    return serviceRef.current;
  }, []);

  const checkNow = useCallback(async () => {
    if (isCheckingRef.current) return null;
    isCheckingRef.current = true;
    setIsChecking(true);
    try {
      const results = await getService().checkAllUpdates();
      setLastResult(results);
      const updated = results.filter((r) => r.updated);
      if (updated.length > 0) {
        onBooksUpdatedRef.current?.(results);
      }
      return results;
    } catch (err) {
      console.error("[SourceSync] checkAllUpdates failed:", err);
      return null;
    } finally {
      isCheckingRef.current = false;
      setIsChecking(false);
    }
  }, [getService]);

  // Delayed startup check + periodic reschedule.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const config = await loadConfig();
      if (cancelled || !config.autoCheck) return;

      const intervalMs = config.intervalMs || DEFAULT_INTERVAL_MS;
      const scheduleNext = (delayMs: number) => {
        timerRef.current = setTimeout(async () => {
          if (cancelled) return;
          await checkNow();
          if (!cancelled) scheduleNext(withJitter(intervalMs));
        }, delayMs);
      };
      scheduleNext(withJitter(STARTUP_DELAY_MS));
    })();

    return () => {
      cancelled = true;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [checkNow]);

  return { isChecking, lastResult, checkNow };
}
