/**
 * CodexNovelLibraryPage — browse remote books + manage shelf.
 */
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLibraryStore } from "@/stores/library-store";
import { useAppStore } from "@/stores/app-store";
import {
  CodexNovelError,
  addCodexNovelToShelf,
  checkCodexNovelShelfUpdates,
  getStoredBaseUrl,
  isCodexNovelLoggedIn,
  listCodexNovelBooks,
  removeCodexNovelFromLocalLibrary,
  removeCodexNovelFromShelf,
  syncCodexNovelShelfToLibrary,
  type CodexNovelBookSummary,
} from "@readany/core/codexnovel";
import { BookOpen, Cloud, Loader2, Plus, RefreshCw, Settings, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

export function CodexNovelLibraryPage() {
  const { t } = useTranslation();
  const loadBooks = useLibraryStore((s) => s.loadBooks);
  const setShowSettings = useAppStore((s) => s.setShowSettings);

  const [ready, setReady] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [baseUrl, setBaseUrl] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [items, setItems] = useState<CodexNovelBookSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [actingId, setActingId] = useState<number | null>(null);
  const pageSize = 20;

  const bootstrap = useCallback(async () => {
    const [url, ok] = await Promise.all([getStoredBaseUrl(), isCodexNovelLoggedIn()]);
    setBaseUrl(url);
    setLoggedIn(ok);
    setReady(true);
  }, []);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  const load = useCallback(async () => {
    if (!loggedIn) return;
    setLoading(true);
    try {
      const data = await listCodexNovelBooks({ q: q.trim() || undefined, page, pageSize });
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch (err) {
      toast.error(err instanceof CodexNovelError ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [loggedIn, page, q]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleAdd = async (novelId: number) => {
    setActingId(novelId);
    try {
      await addCodexNovelToShelf(novelId);
      await syncCodexNovelShelfToLibrary();
      await loadBooks();
      toast.success(t("codexnovel.addedToShelf", "已加入书架"));
    } catch (err) {
      toast.error(err instanceof CodexNovelError ? err.message : String(err));
    } finally {
      setActingId(null);
    }
  };

  const handleRemove = async (novelId: number) => {
    setActingId(novelId);
    try {
      await removeCodexNovelFromShelf(novelId);
      await removeCodexNovelFromLocalLibrary(novelId);
      await loadBooks();
      toast.success(t("codexnovel.removedFromShelf", "已移出书架"));
    } catch (err) {
      toast.error(err instanceof CodexNovelError ? err.message : String(err));
    } finally {
      setActingId(null);
    }
  };

  const handleSync = async () => {
    setLoading(true);
    try {
      const result = await syncCodexNovelShelfToLibrary();
      let updateCount = 0;
      try {
        const updates = await checkCodexNovelShelfUpdates();
        updateCount = updates.updatedNovelIds.length;
      } catch {
        // optional
      }
      await loadBooks();
      toast.success(
        t("codexnovel.shelfSynced", "书架已同步：新增 {{added}}，更新 {{updated}}", {
          added: result.added,
          updated: result.updated,
        }) +
          (updateCount
            ? ` · ${t("codexnovel.updatesFound", "{{count}} 本有更新", { count: updateCount })}`
            : ""),
      );
    } catch (err) {
      toast.error(err instanceof CodexNovelError ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  // Light poll when page becomes ready and logged in
  useEffect(() => {
    if (!loggedIn) return;
    let cancelled = false;
    const run = async () => {
      try {
        await checkCodexNovelShelfUpdates();
        if (!cancelled) await loadBooks();
      } catch {
        // ignore
      }
    };
    void run();
    const timer = window.setInterval(() => void run(), 5 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [loggedIn, loadBooks]);

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!baseUrl || !loggedIn) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <Cloud className="h-10 w-10 text-muted-foreground" />
        <h2 className="text-lg font-semibold">{t("codexnovel.title", "在线书库")}</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          {t(
            "codexnovel.needLogin",
            "请先在设置中配置 CodexNovel 服务器地址并登录，再浏览在线书城。",
          )}
        </p>
        <Button type="button" onClick={() => setShowSettings(true, "codexnovel")}>
          <Settings className="mr-1.5 h-4 w-4" />
          {t("codexnovel.openSettings", "打开在线书库设置")}
        </Button>
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-shrink-0 flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <BookOpen className="h-4 w-4 text-muted-foreground" />
        <h1 className="text-sm font-semibold">{t("codexnovel.store", "在线书城")}</h1>
        <span className="text-xs text-muted-foreground truncate max-w-[240px]">{baseUrl}</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Input
            className="h-8 w-48"
            value={q}
            onChange={(e) => {
              setPage(1);
              setQ(e.target.value);
            }}
            placeholder={t("codexnovel.searchPlaceholder", "搜索书名 / 作者")}
          />
          <Button type="button" size="sm" variant="outline" disabled={loading} onClick={() => void load()}>
            <RefreshCw className={`mr-1 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            {t("common.retry", "刷新")}
          </Button>
          <Button type="button" size="sm" variant="secondary" disabled={loading} onClick={() => void handleSync()}>
            {t("codexnovel.syncShelf", "同步书架")}
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {loading && items.length === 0 ? (
          <div className="flex justify-center py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">
            {t("codexnovel.emptyBooks", "暂无书籍")}
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((book) => (
              <article
                key={book.id}
                className="flex gap-3 rounded-xl border border-border bg-card/40 p-3"
              >
                <div className="h-24 w-16 flex-shrink-0 overflow-hidden rounded-md bg-muted">
                  {book.coverUrl ? (
                    <img
                      src={book.coverUrl}
                      alt=""
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-[10px] text-muted-foreground">
                      cover
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-medium">{book.title}</h3>
                  <p className="truncate text-xs text-muted-foreground">{book.author || "—"}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {t("codexnovel.chapterCount", "{{count}} 章", {
                      count: book.chapterCount ?? book.lastChapterNumber ?? 0,
                    })}
                    {book.lastChapterTitle ? ` · ${book.lastChapterTitle}` : ""}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      disabled={actingId === book.id}
                      onClick={() => void handleAdd(book.id)}
                    >
                      <Plus className="mr-0.5 h-3 w-3" />
                      {t("codexnovel.addShelf", "加书架")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                      disabled={actingId === book.id}
                      onClick={() => void handleRemove(book.id)}
                    >
                      <Trash2 className="mr-0.5 h-3 w-3" />
                      {t("codexnovel.removeShelf", "移出")}
                    </Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-shrink-0 items-center justify-between border-t border-border px-4 py-2 text-xs text-muted-foreground">
        <span>
          {t("codexnovel.pageInfo", "第 {{page}} / {{totalPages}} 页 · 共 {{total}} 本", {
            page,
            totalPages,
            total,
          })}
        </span>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            {t("common.back", "上一页")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={page >= totalPages || loading}
            onClick={() => setPage((p) => p + 1)}
          >
            {t("common.next", "下一页")}
          </Button>
        </div>
      </div>
    </div>
  );
}
