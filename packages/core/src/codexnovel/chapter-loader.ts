import { getCodexNovelChapter } from "./books";
import { readChapterCache, writeChapterCache, type CachedChapter } from "./cache";
import type { CodexNovelChapter } from "./types";

export type LoadedChapter = CodexNovelChapter & { fromCache: boolean };

function chapterFromCache(cached: CachedChapter): LoadedChapter {
  const prev =
    cached.prev !== undefined && cached.prev !== null
      ? cached.prev
      : cached.chapterNumber > 1
        ? cached.chapterNumber - 1
        : null;
  // Prefer stored next; if missing (old cache), assume next chapter exists until server says otherwise
  const next =
    cached.next !== undefined
      ? cached.next
      : cached.chapterNumber + 1;

  return {
    novelId: cached.novelId,
    chapterId: 0,
    chapterNumber: cached.chapterNumber,
    title: cached.title,
    content: cached.content,
    paragraphs: cached.paragraphs,
    contentHash: cached.contentHash,
    updatedAt: cached.updatedAt,
    prev,
    next,
    fromCache: true,
  };
}

/**
 * Load chapter with local contentHash / ETag cache.
 * On 304, returns cached body. On network failure with cache, returns cache.
 */
export async function loadCodexNovelChapter(
  novelId: number,
  chapterNumber: number,
): Promise<LoadedChapter> {
  const cached = await readChapterCache(novelId, chapterNumber);

  try {
    const result = await getCodexNovelChapter(novelId, chapterNumber, {
      ifNoneMatch: cached?.contentHash,
    });

    if (result.notModified) {
      if (cached) return chapterFromCache(cached);
      // 304 without cache — re-fetch without etag
      const fresh = await getCodexNovelChapter(novelId, chapterNumber);
      if (!fresh.chapter) throw new Error("Chapter not available");
      await writeChapterCache(fresh.chapter);
      return { ...fresh.chapter, fromCache: false };
    }

    if (!result.chapter) throw new Error("Chapter empty");
    await writeChapterCache(result.chapter);
    return { ...result.chapter, fromCache: false };
  } catch (err) {
    if (cached) return chapterFromCache(cached);
    throw err;
  }
}

export type { CachedChapter };
