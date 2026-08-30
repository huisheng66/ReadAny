/**
 * Desktop source-sync hook — thin wrapper around the shared core hook.
 * Reloads the library when one or more books were refreshed from their source.
 */
import { useLibraryStore } from "@/stores/library-store";
import { useSourceSync as useSourceSyncCore } from "@readany/core/hooks/use-source-sync";
import { useCallback } from "react";

export function useSourceSync() {
  const loadBooks = useLibraryStore((s) => s.loadBooks);

  const onBooksUpdated = useCallback(async () => {
    await loadBooks();
  }, [loadBooks]);

  return useSourceSyncCore(onBooksUpdated);
}
