import { codexNovelRequest } from "./client";

export interface CodexNovelBookmark {
  id: number;
  novelId: number;
  chapterId?: number | null;
  chapterNumber: number;
  offsetRatio: number;
  note?: string | null;
  color?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export async function listCodexNovelBookmarks(novelId?: number): Promise<CodexNovelBookmark[]> {
  const { data } = await codexNovelRequest<{ items?: CodexNovelBookmark[] } | CodexNovelBookmark[]>(
    "/me/bookmarks",
    {
      auth: "user",
      query: novelId != null ? { novelId } : undefined,
    },
  );
  if (Array.isArray(data)) return data;
  return data.items || [];
}

export async function createCodexNovelBookmark(input: {
  novelId: number;
  chapterNumber: number;
  offsetRatio: number;
  note?: string;
  color?: string;
}): Promise<CodexNovelBookmark> {
  const { data } = await codexNovelRequest<CodexNovelBookmark>("/me/bookmarks", {
    method: "POST",
    auth: "user",
    body: input,
  });
  return data;
}

export async function updateCodexNovelBookmark(
  id: number,
  input: Partial<{
    chapterNumber: number;
    offsetRatio: number;
    note: string;
    color: string;
  }>,
): Promise<CodexNovelBookmark> {
  const { data } = await codexNovelRequest<CodexNovelBookmark>(`/me/bookmarks/${id}`, {
    method: "PUT",
    auth: "user",
    body: input,
  });
  return data;
}

export async function deleteCodexNovelBookmark(id: number): Promise<void> {
  await codexNovelRequest(`/me/bookmarks/${id}`, {
    method: "DELETE",
    auth: "user",
  });
}
