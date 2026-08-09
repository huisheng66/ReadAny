import { codexNovelRequest } from "./client";
import type { CodexNovelBookSummary, CodexNovelChapter, CodexNovelTocPage } from "./types";

export interface ListBooksParams {
  q?: string;
  page?: number;
  pageSize?: number;
}

export interface ListBooksResult {
  page: number;
  pageSize: number;
  total: number;
  items: CodexNovelBookSummary[];
}

export async function listCodexNovelBooks(params: ListBooksParams = {}): Promise<ListBooksResult> {
  const { data } = await codexNovelRequest<ListBooksResult>("/books", {
    auth: "user-or-site",
    query: {
      q: params.q || undefined,
      page: params.page ?? 1,
      pageSize: params.pageSize ?? 20,
    },
  });
  return data;
}

export async function getCodexNovelBook(novelId: number): Promise<CodexNovelBookSummary> {
  const { data } = await codexNovelRequest<CodexNovelBookSummary>(`/books/${novelId}`, {
    auth: "user-or-site",
  });
  return data;
}

export async function getCodexNovelToc(
  novelId: number,
  params: { page?: number; pageSize?: number } = {},
): Promise<CodexNovelTocPage> {
  const { data } = await codexNovelRequest<CodexNovelTocPage>(`/books/${novelId}/toc`, {
    auth: "user-or-site",
    query: {
      page: params.page ?? 1,
      pageSize: params.pageSize ?? 100,
    },
  });
  return data;
}

export interface GetChapterResult {
  chapter: CodexNovelChapter | null;
  status: number;
  etag: string | null;
  notModified: boolean;
}

export async function getCodexNovelChapter(
  novelId: number,
  chapterNumber: number,
  options: { ifNoneMatch?: string } = {},
): Promise<GetChapterResult> {
  const res = await codexNovelRequest<CodexNovelChapter>(
    `/books/${novelId}/chapters/${chapterNumber}`,
    {
      auth: "user-or-site",
      ifNoneMatch: options.ifNoneMatch,
    },
  );
  if (res.status === 304) {
    return { chapter: null, status: 304, etag: res.etag, notModified: true };
  }
  return { chapter: res.data, status: res.status, etag: res.etag, notModified: false };
}
