/**
 * Generic book-source contracts.
 *
 * Intentionally vendor-agnostic: adapters may wrap any HTTP/API/scraper
 * implementation (including custom rule engines). ReadAny does not hardcode
 * a single upstream product.
 */

export interface BookSourceDescriptor {
  /** Stable unique id, e.g. "my-api", "legado-rule-set-a" */
  id: string;
  /** Human-readable name shown in UI */
  name: string;
  /** Optional short description */
  description?: string;
  /** Adapter capability flags */
  capabilities?: {
    search?: boolean;
    browse?: boolean;
    toc?: boolean;
    chapter?: boolean;
    auth?: boolean;
  };
}

export interface BookSourceSearchQuery {
  q?: string;
  page?: number;
  pageSize?: number;
}

export interface BookSourceSearchResult {
  /** Source-local book id (string to allow any backend) */
  sourceBookId: string;
  title: string;
  author?: string;
  coverUrl?: string;
  description?: string;
  chapterCount?: number;
  /** Opaque extra fields for the adapter */
  extra?: Record<string, unknown>;
}

export interface BookSourceChapter {
  id: string;
  title: string;
  index?: number;
}

export interface BookSourceChapterContent {
  id: string;
  title: string;
  /** Plain text or simple HTML body */
  content: string;
  prevId?: string | null;
  nextId?: string | null;
}

/**
 * Adapter interface implementers register via `registerBookSource`.
 * Methods are optional so a source can expose only search, or only browse, etc.
 */
export interface BookSourceAdapter extends BookSourceDescriptor {
  search?(query: BookSourceSearchQuery): Promise<{
    items: BookSourceSearchResult[];
    total?: number;
    page?: number;
    pageSize?: number;
  }>;
  listBooks?(query?: BookSourceSearchQuery): Promise<{
    items: BookSourceSearchResult[];
    total?: number;
    page?: number;
    pageSize?: number;
  }>;
  getToc?(sourceBookId: string): Promise<BookSourceChapter[]>;
  getChapter?(sourceBookId: string, chapterId: string): Promise<BookSourceChapterContent>;
}
