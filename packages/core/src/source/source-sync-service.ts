/**
 * SourceSyncService — checks WebDAV-backed novel sources for updates and
 * downloads refreshed EPUBs when the remote ETag changes.
 *
 * Books imported from a novel-toolchain WebDAV carry `sourceType = "novel-webdav"`
 * and a `sourceInfo` block with the connection details + last-seen ETag. This
 * service compares the remote ETag against the stored one; on a mismatch it
 * re-downloads the EPUB, replaces the local file atomically, parses the new
 * source.json for the updated chapter count, and persists the new state.
 */
import { getBook, getBooks, updateBook } from "../db/book-queries";
import { getPlatformService } from "../services/platform";
import { parallelLimit } from "../sync/sync-transfer";
import { WebDavClient } from "../sync/webdav-client";
import type { Book, BookSource } from "../types";
import { parseNovelSourceJson } from "./source-json";

/** Concurrency limit for batch update checks (avoids bursting the WebDAV server). */
const CHECK_CONCURRENCY = 3;

/** Downloaded EPUBs below this size are treated as invalid (e.g. HTML error pages). */
const MIN_EPUB_BYTES = 1024;

/** Books with an update check in flight (shared between batch and manual checks). */
const inFlightBooks = new Set<string>();

interface RemoteStat {
  etag?: string;
  lastModified?: string;
  contentLength?: number;
}

export interface SourceUpdateResult {
  bookId: string;
  title: string;
  updated: boolean;
  newChapterCount?: number;
  error?: string;
}

/** EPUB is a zip: verify the PK magic and a sane minimum size before touching disk. */
function assertValidEpubBytes(bytes: Uint8Array): void {
  if (bytes.length < MIN_EPUB_BYTES || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    throw new Error("下载的内容不是有效的 EPUB 文件,已保留本地原文件");
  }
}

export class SourceSyncService {
  /**
   * Check every book with `sourceType = "novel-webdav"` for remote updates.
   * Runs with a concurrency limit of {@link CHECK_CONCURRENCY}.
   */
  async checkAllUpdates(): Promise<SourceUpdateResult[]> {
    const books = await getBooks();
    const sourced = books.filter((book) => book.sourceType === "novel-webdav" && book.sourceInfo);
    const tasks = sourced.map((book) => () => this.checkBookWithResult(book));
    return parallelLimit(tasks, CHECK_CONCURRENCY);
  }

  /**
   * Check a single book for updates. Returns true if a new EPUB was downloaded
   * and the local copy replaced. Concurrent checks for the same book are
   * coalesced (batch + manual entry points share the in-flight set).
   */
  async checkUpdate(book: Book): Promise<boolean> {
    if (!book.sourceInfo) return false;
    if (inFlightBooks.has(book.id)) return false;
    inFlightBooks.add(book.id);
    try {
      return await this.checkUpdateInner(book);
    } finally {
      inFlightBooks.delete(book.id);
    }
  }

  /**
   * Run checkUpdate for a book and wrap the outcome in a {@link SourceUpdateResult}.
   * Re-reads the book from the DB after a successful update to report the new
   * chapter count.
   */
  private async checkBookWithResult(book: Book): Promise<SourceUpdateResult> {
    try {
      const updated = await this.checkUpdate(book);
      let newChapterCount: number | undefined;
      if (updated) {
        const refreshed = await getBook(book.id);
        newChapterCount = refreshed?.sourceInfo?.chapterCount;
      }
      return {
        bookId: book.id,
        title: book.meta.title,
        updated,
        newChapterCount: updated ? newChapterCount : undefined,
      };
    } catch (err) {
      return {
        bookId: book.id,
        title: book.meta.title,
        updated: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  private async checkUpdateInner(book: Book): Promise<boolean> {
    // Re-read from the DB: the caller may hold a stale snapshot (e.g. from the
    // store cache), and etag/allowInsecure must reflect the persisted state.
    const current = (await getBook(book.id)) ?? book;
    if (!current.sourceInfo) return false;
    const info = current.sourceInfo;
    const client = new WebDavClient(
      info.webdavUrl,
      info.username,
      info.password,
      // 旧书源无该字段时保持既有行为;新导入始终显式持久化用户的选择
      info.allowInsecure ?? true,
    );

    let stat: RemoteStat;
    try {
      stat = await client.stat(info.relativePath);
    } catch (err) {
      console.warn(
        `[SourceSync] stat failed for "${current.meta.title}":`,
        err instanceof Error ? err.message : err,
      );
      await updateBook(current.id, { sourceLastCheckedAt: Date.now() }).catch(() => undefined);
      return false;
    }

    const now = Date.now();

    // First-time baseline: record the remote state without downloading so we
    // don't treat the initial import as an "update".
    if (!info.etag && !info.lastModified) {
      const baseline: BookSource = {
        ...info,
        etag: stat.etag,
        lastModified: stat.lastModified ? new Date(stat.lastModified).getTime() : now,
        contentLength: stat.contentLength,
      };
      await updateBook(current.id, {
        sourceInfo: baseline,
        sourceLastCheckedAt: now,
      });
      return false;
    }

    if (this.remoteUnchanged(stat, info)) {
      await updateBook(current.id, { sourceLastCheckedAt: now });
      return false;
    }

    // Remote changed → fetch the new EPUB.
    return this.downloadAndUpdate(current, client, stat);
  }

  /**
   * ETag comparison when the server provides one; otherwise fall back to
   * Last-Modified + Content-Length so servers without ETag support don't
   * trigger a full re-download on every check.
   */
  private remoteUnchanged(stat: RemoteStat, info: BookSource): boolean {
    if (stat.etag) return stat.etag === info.etag;

    if (info.lastModified && stat.lastModified) {
      const remoteMs = new Date(stat.lastModified).getTime();
      if (Number.isFinite(remoteMs) && remoteMs !== info.lastModified) return false;
      if (
        info.contentLength !== undefined &&
        stat.contentLength !== undefined &&
        stat.contentLength !== info.contentLength
      ) {
        return false;
      }
      return true;
    }
    return false;
  }

  /**
   * Download the updated EPUB, replace the local file atomically
   * (temp file + rename, never truncating the original in place), parse its
   * source.json for the new chapter count, and persist the refreshed state.
   */
  private async downloadAndUpdate(
    book: Book,
    client: WebDavClient,
    stat: RemoteStat,
  ): Promise<boolean> {
    if (!book.sourceInfo) return false;
    const info = book.sourceInfo;

    const bytes = await client.get(info.relativePath);
    assertValidEpubBytes(bytes);

    // Resolve the (relative) book file path against the user data root and
    // replace the existing EPUB: write to a sibling temp file, then rename so a
    // crash mid-download can never leave a truncated book on disk.
    const platform = getPlatformService();
    const dataDir = await platform.getDataDir();
    const absPath = await platform.joinPath(dataDir, book.filePath);
    if (platform.rename) {
      const tmpPath = `${absPath}.tmp-${Date.now()}`;
      try {
        await platform.writeFile(tmpPath, bytes);
        await platform.rename(tmpPath, absPath);
      } catch (err) {
        await platform.deleteFile(tmpPath).catch(() => undefined);
        throw err;
      }
    } else {
      await platform.writeFile(absPath, bytes);
    }

    // Parse the downloaded EPUB's source.json for the new chapter count.
    const sourceJson = await parseNovelSourceJson(bytes);
    const now = Date.now();
    const updatedSourceInfo: BookSource = {
      ...info,
      etag: stat.etag ?? info.etag,
      lastModified: stat.lastModified ? new Date(stat.lastModified).getTime() : now,
      contentLength: stat.contentLength ?? bytes.length,
      chapterCount: sourceJson?.chapterCount ?? info.chapterCount,
    };

    await updateBook(book.id, {
      sourceInfo: updatedSourceInfo,
      sourceLastCheckedAt: now,
    });

    console.log(
      `[SourceSync] Updated "${book.meta.title}" (chapterCount: ${updatedSourceInfo.chapterCount})`,
    );
    return true;
  }
}
