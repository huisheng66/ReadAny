import { getPlatformService } from "../services/platform";
import type { CodexNovelChapter } from "./types";

export interface CachedChapter {
  novelId: number;
  chapterNumber: number;
  title: string;
  content: string;
  paragraphs: string[];
  contentHash: string;
  updatedAt: string;
  cachedAt: number;
}

async function chapterCachePath(novelId: number, chapterNumber: number): Promise<string> {
  const platform = getPlatformService();
  const root = await platform.getDataDir();
  return platform.joinPath(
    root,
    "codexnovel",
    "chapters",
    String(novelId),
    `${chapterNumber}.json`,
  );
}

async function chapterDir(novelId: number): Promise<string> {
  const platform = getPlatformService();
  const root = await platform.getDataDir();
  return platform.joinPath(root, "codexnovel", "chapters", String(novelId));
}

export async function readChapterCache(
  novelId: number,
  chapterNumber: number,
): Promise<CachedChapter | null> {
  const platform = getPlatformService();
  const path = await chapterCachePath(novelId, chapterNumber);
  try {
    if (!(await platform.exists(path))) return null;
    const text = await platform.readTextFile(path);
    const parsed = JSON.parse(text) as CachedChapter;
    if (!parsed?.contentHash) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function writeChapterCache(chapter: CodexNovelChapter): Promise<CachedChapter> {
  const platform = getPlatformService();
  const dir = await chapterDir(chapter.novelId);
  await platform.mkdir(dir);
  const cached: CachedChapter = {
    novelId: chapter.novelId,
    chapterNumber: chapter.chapterNumber,
    title: chapter.title,
    content: chapter.content,
    paragraphs: chapter.paragraphs || [],
    contentHash: chapter.contentHash,
    updatedAt: chapter.updatedAt,
    cachedAt: Date.now(),
  };
  const path = await chapterCachePath(chapter.novelId, chapter.chapterNumber);
  await platform.writeTextFile(path, JSON.stringify(cached));
  return cached;
}

export async function invalidateChapterCache(
  novelId: number,
  chapterNumber: number,
): Promise<void> {
  const platform = getPlatformService();
  const path = await chapterCachePath(novelId, chapterNumber);
  try {
    if (await platform.exists(path)) {
      await platform.deleteFile(path);
    }
  } catch {
    // ignore
  }
}
