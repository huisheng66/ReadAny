import { getCodexNovelChapter } from "./books";
import { readChapterCache, writeChapterCache, type CachedChapter } from "./cache";
import type { CodexNovelChapter } from "./types";

export type LoadedChapter = CodexNovelChapter & { fromCache: boolean };

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
      if (cached) {
        return {
          novelId: cached.novelId,
          chapterId: 0,
          chapterNumber: cached.chapterNumber,
          title: cached.title,
          content: cached.content,
          paragraphs: cached.paragraphs,
          contentHash: cached.contentHash,
          updatedAt: cached.updatedAt,
          prev: chapterNumber > 1 ? chapterNumber - 1 : null,
          next: null, // unknown from cache alone
          fromCache: true,
        };
      }
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
    if (cached) {
      return {
        novelId: cached.novelId,
        chapterId: 0,
        chapterNumber: cached.chapterNumber,
        title: cached.title,
        content: cached.content,
        paragraphs: cached.paragraphs,
        contentHash: cached.contentHash,
        updatedAt: cached.updatedAt,
        prev: chapterNumber > 1 ? chapterNumber - 1 : null,
        next: null,
        fromCache: true,
      };
    }
    throw err;
  }
}

export type { CachedChapter };
