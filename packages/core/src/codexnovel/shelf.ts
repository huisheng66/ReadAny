import { codexNovelRequest } from "./client";
import type { CodexNovelShelfItem } from "./types";

export interface ListShelfResult {
  items: CodexNovelShelfItem[];
}

export async function listCodexNovelShelf(): Promise<CodexNovelShelfItem[]> {
  const { data } = await codexNovelRequest<ListShelfResult>("/me/shelf", { auth: "user" });
  return data.items || [];
}

export async function addCodexNovelToShelf(novelId: number): Promise<unknown> {
  const { data } = await codexNovelRequest("/me/shelf", {
    method: "POST",
    auth: "user",
    body: { novelId },
  });
  return data;
}

export async function removeCodexNovelFromShelf(novelId: number): Promise<unknown> {
  const { data } = await codexNovelRequest(`/me/shelf/${novelId}`, {
    method: "DELETE",
    auth: "user",
  });
  return data;
}

export interface ShelfUpdatesResult {
  since: string;
  serverTime: string;
  items: Array<
    CodexNovelShelfItem & {
      newChapterCount?: number;
    }
  >;
}

export async function listCodexNovelShelfUpdates(since: string): Promise<ShelfUpdatesResult> {
  const { data } = await codexNovelRequest<ShelfUpdatesResult>("/me/shelf/updates", {
    auth: "user",
    query: { since },
  });
  return data;
}
