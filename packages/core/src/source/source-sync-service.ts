/**
 * SourceSyncService — checks WebDAV-backed novel sources for updates and
 * downloads refreshed EPUBs when the remote ETag changes.
 *
 * Books imported from a novel-toolchain WebDAV carry `sourceType = "novel-webdav"`
 * and a `sourceInfo` block with the connection details + last-seen ETag. This
 * service compares the remote ETag against the stored one; on a mismatch it
 * re-downloads the EPUB, overwrites the local file, parses the new source.json
 * for the updated chapter count, and persists the new state.
 */
import { getBook, getBooks, updateBook } from "../db/book-queries";
import { parseNovelSourceJson } from "./source-json";
import { getPlatformService } from "../services/platform";
import { parallelLimit } from "../sync/sync-transfer";
import { WebDavClient } from "../sync/webdav-client";
import type { Book, BookSource } from "../types";

/** Concurrency limit for batch update checks (avoids bursting the WebDAV server). */
const CHECK_CONCURRENCY = 3;

/** Always allow self-signed/insecure certs for source checks (NAS deployments). */
const ALLOW_INSECURE = true;

export interface SourceUpdateResult {
  bookId: string;
  title: string;
  updated: boolean;
  newChapterCount?: number;
  error?: string;
}

export class SourceSyncService {
  /**
   * Check every book with `sourceType = "novel-webdav"` for remote updates.
   * Runs with a concurrency limit of {@link CHECK_CONCURRENCY}.
   */
  async checkAllUpdates(): Promise<SourceUpdateResult[]> {
    const books = await getBooks();
    const sourced = books.filter(
      (book) => book.sourceType === "novel-webdav" && book.sourceInfo,
    );
    const tasks = sourced.map((book) => () => this.checkBookWithResult(book));
    return parallelLimit(tasks, CHECK_CONCURRENCY);
  }

  /**
   * Check a single book for updates. Returns true if a new EPUB was downloaded
   * and the local copy replaced.
   */
  async checkUpdate(book: Book): Promise<boolean> {
    if (!book.sourceInfo) return false;
    const info = book.sourceInfo;
    const client = new WebDavClient(info.webdavUrl, info.username, info.password, ALLOW_INSECURE);

    let stat: { etag?: string; lastModified?: string; contentLength?: number };
    try {
      stat = await client.stat(info.relativePath);
    } catch (err) {
      console.warn(
        `[SourceSync] stat failed for "${book.meta.title}":`,
        err instanceof Error ? err.message : err,
      );
      await updateBook(book.id, { sourceLastCheckedAt: Date.now() }).catch(() => undefined);
      return false;
    }

    const now = Date.now();

    // First-time baseline: no stored ETag yet. Record the current one without
    // downloading so we don't treat the initial import as an "update".
    if (!info.etag) {
      const baseline: BookSource = {
        ...info,
        etag: stat.etag,
        lastModified: stat.lastModified ? new Date(stat.lastModified).getTime() : now,
      };
      await updateBook(book.id, {
        sourceInfo: baseline,
        sourceLastCheckedAt: now,
      });
      return false;
    }

    if (stat.etag && stat.etag === info.etag) {
      await updateBook(book.id, { sourceLastCheckedAt: now });
      return false;
    }

    // ETag changed (or server returned none) → fetch the new EPUB.
    return this.downloadAndUpdate(book, client, stat.etag);
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

  /**
   * Download the updated EPUB, overwrite the local file, parse its source.json
   * for the new chapter count, and persist the refreshed sourceInfo.
   */
  private async downloadAndUpdate(
    book: Book,
    client: WebDavClient,
    newEtag?: string,
  ): Promise<boolean> {
    if (!book.sourceInfo) return false;
    const info = book.sourceInfo;

    const bytes = await client.get(info.relativePath);

    // Resolve the (relative) book file path against the user data root and
    // overwrite the existing EPUB in place.
    const platform = getPlatformService();
    const dataDir = await platform.getDataDir();
    const absPath = await platform.joinPath(dataDir, book.filePath);
    await platform.writeFile(absPath, bytes);

    // Parse the downloaded EPUB's source.json for the new chapter count.
    const sourceJson = await parseNovelSourceJson(bytes);
    const now = Date.now();
    const updatedSourceInfo: BookSource = {
      ...info,
      etag: newEtag ?? info.etag,
      lastModified: now,
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
