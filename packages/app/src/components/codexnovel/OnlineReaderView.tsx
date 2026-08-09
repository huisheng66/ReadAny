/**
 * OnlineReaderView — chapter-stream reader for CodexNovel online books.
 */
import { Button } from "@/components/ui/button";
import { useLibraryStore } from "@/stores/library-store";
import {
  CodexNovelError,
  decodeCodexNovelCfi,
  encodeCodexNovelCfi,
  flushProgressQueue,
  getCodexNovelProgress,
  applyCodexNovelTocDelta,
  createCodexNovelBookmark,
  loadCodexNovelChapter,
  parseCodexNovelBookId,
  progressRatioFromChapter,
  saveCodexNovelProgress,
  type LoadedChapter,
} from "@readany/core/codexnovel";
import { throttle } from "@readany/core/utils";
import { BookmarkPlus, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

interface OnlineReaderViewProps {
  bookId: string;
  tabId: string;
}

export function OnlineReaderView({ bookId }: OnlineReaderViewProps) {
  const { t } = useTranslation();
  const book = useLibraryStore((s) => s.books.find((b) => b.id === bookId));
  const updateBook = useLibraryStore((s) => s.updateBook);

  const novelId = useMemo(() => parseCodexNovelBookId(bookId), [bookId]);
  const [chapterNumber, setChapterNumber] = useState(1);
  const [chapter, setChapter] = useState<LoadedChapter | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef(0);
  const chapterRef = useRef(chapterNumber);
  chapterRef.current = chapterNumber;

  const lastChapterNumber =
    book?.meta.totalChapters ||
    chapter?.chapterNumber ||
    chapterNumber;

  const persistLocal = useCallback(
    (ch: number, offsetRatio: number) => {
      const cfi = encodeCodexNovelCfi(ch, offsetRatio);
      const progress = progressRatioFromChapter(ch, lastChapterNumber, offsetRatio);
      void updateBook(bookId, {
        progress,
        currentCfi: cfi,
        lastOpenedAt: Date.now(),
      });
    },
    [bookId, lastChapterNumber, updateBook],
  );

  const persistCloud = useCallback(
    (ch: number, offsetRatio: number) => {
      if (!novelId) return;
      void saveCodexNovelProgress({
        novelId,
        chapterNumber: ch,
        offsetRatio,
        updatedAt: new Date().toISOString(),
        deviceName: "ReadAny Desktop",
      });
    },
    [novelId],
  );

  const throttledSave = useRef(
    throttle((ch: number, offsetRatio: number) => {
      persistLocal(ch, offsetRatio);
      persistCloud(ch, offsetRatio);
    }, 5000),
  ).current;

  const flushSave = useCallback(() => {
    const ch = chapterRef.current;
    const off = offsetRef.current;
    persistLocal(ch, off);
    persistCloud(ch, off);
  }, [persistCloud, persistLocal]);

  // Resolve initial chapter from local CFI / cloud progress
  useEffect(() => {
    if (!novelId) return;
    let cancelled = false;

    (async () => {
      await flushProgressQueue();
      // Refresh TOC delta / invalidate changed chapter caches when opening
      try {
        await applyCodexNovelTocDelta(novelId);
      } catch {
        // offline or first open without since — ignore
      }
      const local = decodeCodexNovelCfi(book?.currentCfi);
      let startCh = local?.chapterNumber || 1;
      let startOff = local?.offsetRatio || 0;

      try {
        const remote = await getCodexNovelProgress(novelId);
        if (remote?.updatedAt) {
          const localUpdated = book?.updatedAt || 0;
          const remoteMs = Date.parse(remote.updatedAt) || 0;
          if (remoteMs >= localUpdated) {
            startCh = remote.chapterNumber || startCh;
            startOff = remote.offsetRatio ?? startOff;
          }
        }
      } catch {
        // offline — use local
      }

      if (cancelled) return;
      offsetRef.current = startOff;
      setChapterNumber(startCh);
    })();

    return () => {
      cancelled = true;
    };
    // only on mount / book change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [novelId, bookId]);

  const loadChapter = useCallback(
    async (ch: number) => {
      if (!novelId) return;
      setLoading(true);
      setError(null);
      try {
        const data = await loadCodexNovelChapter(novelId, ch);
        setChapter(data);
        // Prefetch next
        if (data.next) {
          void loadCodexNovelChapter(novelId, data.next).catch(() => {});
        }
      } catch (err) {
        const msg = err instanceof CodexNovelError ? err.message : String(err);
        setError(msg);
        setChapter(null);
        toast.error(msg);
      } finally {
        setLoading(false);
      }
    },
    [novelId],
  );

  useEffect(() => {
    if (!novelId) return;
    void loadChapter(chapterNumber);
  }, [chapterNumber, loadChapter, novelId]);

  // Restore scroll offset when chapter content ready
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !chapter) return;
    const ratio = offsetRef.current;
    requestAnimationFrame(() => {
      const max = el.scrollHeight - el.clientHeight;
      if (max > 0 && ratio > 0) {
        el.scrollTop = max * ratio;
      } else {
        el.scrollTop = 0;
      }
    });
  }, [chapter?.chapterNumber, chapter?.contentHash]);

  useEffect(() => {
    const onHide = () => flushSave();
    window.addEventListener("pagehide", onHide);
    window.addEventListener("beforeunload", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("beforeunload", onHide);
      flushSave();
    };
  }, [flushSave]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    const ratio = max > 0 ? el.scrollTop / max : 0;
    offsetRef.current = Math.max(0, Math.min(1, ratio));
    throttledSave(chapterRef.current, offsetRef.current);
  };

  const goChapter = (next: number | null | undefined) => {
    if (!next || next < 1) return;
    flushSave();
    offsetRef.current = 0;
    setChapterNumber(next);
  };

  const addBookmark = async () => {
    if (!novelId) return;
    try {
      await createCodexNovelBookmark({
        novelId,
        chapterNumber: chapterRef.current,
        offsetRatio: offsetRef.current,
        note: chapter?.title || "",
        color: "yellow",
      });
      toast.success(t("codexnovel.bookmarkAdded", "书签已添加"));
    } catch (err) {
      toast.error(err instanceof CodexNovelError ? err.message : String(err));
    }
  };

  if (!novelId) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {t("codexnovel.invalidBook", "无效的在线书籍")}
      </div>
    );
  }

  const prev = chapter?.prev ?? (chapterNumber > 1 ? chapterNumber - 1 : null);
  const next = chapter?.next ?? null;

  return (
    <div className="flex h-full flex-col bg-background">
      <header className="flex flex-shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{book?.meta.title || "—"}</div>
          <div className="truncate text-xs text-muted-foreground">
            {chapter?.title || t("codexnovel.loadingChapter", "加载章节…")}
            {chapter?.fromCache ? ` · ${t("codexnovel.cached", "缓存")}` : ""}
          </div>
        </div>
        <Button type="button" size="sm" variant="ghost" disabled={loading} onClick={() => void addBookmark()}>
          <BookmarkPlus className="h-4 w-4" />
          <span className="ml-1 hidden sm:inline">{t("codexnovel.bookmark", "书签")}</span>
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!prev || loading}
          onClick={() => goChapter(prev)}
        >
          <ChevronLeft className="h-4 w-4" />
          {t("common.back", "上一章")}
        </Button>
        <span className="text-xs text-muted-foreground tabular-nums">#{chapterNumber}</span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!next || loading}
          onClick={() => goChapter(next)}
        >
          {t("common.next", "下一章")}
          <ChevronRight className="h-4 w-4" />
        </Button>
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-6 py-6" onScroll={onScroll}>
        {loading && !chapter ? (
          <div className="flex justify-center py-20 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : error && !chapter ? (
          <div className="mx-auto max-w-prose py-16 text-center text-sm text-destructive">{error}</div>
        ) : (
          <article className="mx-auto max-w-prose">
            <h1 className="mb-6 text-xl font-semibold leading-snug">{chapter?.title}</h1>
            <div className="space-y-4 text-[17px] leading-8 text-foreground/90">
              {(chapter?.paragraphs?.length
                ? chapter.paragraphs
                : (chapter?.content || "").split(/\n+/).filter(Boolean)
              ).map((p, i) => (
                <p key={`${chapter?.chapterNumber}-${i}`}>{p}</p>
              ))}
            </div>
            {loading ? (
              <div className="mt-6 flex justify-center text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            ) : null}
          </article>
        )}
      </div>
    </div>
  );
}
