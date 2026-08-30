/**
 * Parse the novel source.json embedded inside an EPUB.
 *
 * Novel-toolchain EPUBs ship a `source.json` (typically at `OEBPS/source.json`)
 * describing the originating web novel: type, novelId, novelTitle, chapterCount,
 * lastUpdated. This metadata lets ReadAny track the book as an auto-updating
 * source and detect new chapters.
 */
import { readZipTextEntry } from "../epub/zip";

export interface NovelSourceInfo {
  type: string;
  novelId: number;
  novelTitle: string;
  chapterCount: number;
  lastUpdated: number;
}

/** Candidate paths for source.json inside the EPUB ZIP. */
const SOURCE_JSON_CANDIDATES = ["OEBPS/source.json", "source.json"];

/**
 * Read and parse source.json from EPUB bytes.
 * Returns null if no source.json is present or the payload is malformed.
 */
export async function parseNovelSourceJson(
  bytes: Uint8Array,
): Promise<NovelSourceInfo | null> {
  for (const candidate of SOURCE_JSON_CANDIDATES) {
    const text = await readZipTextEntry(bytes, candidate);
    if (!text) continue;
    try {
      const parsed = JSON.parse(text) as Partial<NovelSourceInfo>;
      if (
        typeof parsed.novelId === "number" &&
        typeof parsed.chapterCount === "number"
      ) {
        return {
          type: parsed.type ?? "novel-webdav",
          novelId: parsed.novelId,
          novelTitle: parsed.novelTitle ?? "",
          chapterCount: parsed.chapterCount,
          lastUpdated: parsed.lastUpdated ?? 0,
        };
      }
    } catch {
      // Not valid JSON — try the next candidate path.
    }
  }
  return null;
}
