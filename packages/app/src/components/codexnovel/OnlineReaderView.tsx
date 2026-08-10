/**
 * OnlineReaderView — CodexNovel online books with native ReadAny reader chrome
 * and online-adapted features: settings, chapter search, translation, TTS, AI chat.
 */
import { ChatPanel } from "@/components/chat/ChatPanel";
import type { TOCItem } from "@/components/reader/FoliateViewer";
import { FooterBar } from "@/components/reader/FooterBar";
import { ReaderToolbar } from "@/components/reader/ReaderToolbar";
import { ResizeHandle } from "@/components/reader/ResizeHandle";
import { SearchBar } from "@/components/reader/SearchBar";
import { TOCPanel } from "@/components/reader/TOCPanel";
import { TTSPage } from "@/components/reader/TTSPage";
import { ReadSettingsPanel } from "@/components/settings/ReadSettings";
import { useResizablePanel } from "@/hooks/use-resizable-panel";
import { readingContextService } from "@/lib/ai/reading-context-service";
import { getFontTheme } from "@/lib/reader/font-themes";
import { useLibraryStore } from "@/stores/library-store";
import { useReaderStore } from "@/stores/reader-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useTTSStore } from "@/stores/tts-store";
import {
  CodexNovelError,
  applyCodexNovelTocDelta,
  decodeCodexNovelCfi,
  encodeCodexNovelCfi,
  flushProgressQueue,
  getCodexNovelProgress,
  getCodexNovelToc,
  loadCodexNovelChapter,
  parseCodexNovelBookId,
  progressRatioFromChapter,
  saveCodexNovelProgress,
  type CodexNovelTocItem,
  type LoadedChapter,
} from "@readany/core/codexnovel";
import { useChapterTranslation } from "@readany/core/hooks";
import type { ChapterTranslationResult } from "@readany/core/translation/chapter-translator";
import type { CitationPart } from "@readany/core/types";
import { throttle } from "@readany/core/utils";
import { Loader2, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

const CHAPTER_HREF_PREFIX = "cn-chapter:";
const TOOLBAR_PIN_STORAGE_KEY = "readany-reader-toolbar-pinned";

interface OnlineReaderViewProps {
  bookId: string;
  tabId: string;
}

interface SearchHit {
  paraIndex: number;
  start: number;
  end: number;
}

function chapterHref(n: number): string {
  return `${CHAPTER_HREF_PREFIX}${n}`;
}

function parseChapterHref(href: string | undefined): number | null {
  if (!href?.startsWith(CHAPTER_HREF_PREFIX)) return null;
  const n = Number.parseInt(href.slice(CHAPTER_HREF_PREFIX.length), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function tocItemsFromApi(items: CodexNovelTocItem[]): TOCItem[] {
  return items.map((item) => ({
    id: String(item.id ?? item.chapterNumber),
    title: item.title || `第 ${item.chapterNumber} 章`,
    level: 0,
    href: chapterHref(item.chapterNumber),
    index: item.chapterNumber - 1,
  }));
}

async function loadAllToc(novelId: number): Promise<TOCItem[]> {
  const pageSize = 200;
  let page = 1;
  let totalPages = 1;
  const all: CodexNovelTocItem[] = [];
  while (page <= totalPages) {
    const res = await getCodexNovelToc(novelId, { page, pageSize });
    all.push(...(res.items || []));
    totalPages = Math.max(1, res.totalPages || 1);
    if (!res.items?.length) break;
    page += 1;
    if (page > 200) break;
  }
  return tocItemsFromApi(all);
}

function chapterParagraphs(chapter: LoadedChapter | null): string[] {
  if (!chapter) return [];
  if (chapter.paragraphs?.length) return chapter.paragraphs;
  return (chapter.content || "").split(/\n+/).filter(Boolean);
}

function findChapterHits(paragraphs: string[], query: string): SearchHit[] {
  const q = query.trim();
  if (!q) return [];
  const lowerQ = q.toLowerCase();
  const hits: SearchHit[] = [];
  paragraphs.forEach((text, paraIndex) => {
    const lower = text.toLowerCase();
    let from = 0;
    while (from < lower.length) {
      const idx = lower.indexOf(lowerQ, from);
      if (idx === -1) break;
      hits.push({ paraIndex, start: idx, end: idx + q.length });
      from = idx + Math.max(1, q.length);
    }
  });
  return hits;
}

function renderHighlightedParagraph(
  text: string,
  hits: SearchHit[],
  activeHitGlobalIndex: number,
  hitBaseIndex: number,
): ReactNode {
  if (!hits.length) return text;
  const nodes: ReactNode[] = [];
  let cursor = 0;
  hits.forEach((hit, i) => {
    if (hit.start > cursor) nodes.push(text.slice(cursor, hit.start));
    const globalIndex = hitBaseIndex + i;
    const active = globalIndex === activeHitGlobalIndex;
    nodes.push(
      <mark
        key={`hit-${hit.paraIndex}-${hit.start}`}
        data-search-hit={globalIndex}
        className={
          active
            ? "rounded-sm bg-primary/35 text-foreground"
            : "rounded-sm bg-yellow-200/70 text-foreground dark:bg-yellow-500/30"
        }
      >
        {text.slice(hit.start, hit.end)}
      </mark>,
    );
    cursor = hit.end;
  });
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

export function OnlineReaderView({ bookId, tabId }: OnlineReaderViewProps) {
  const { t } = useTranslation();
  const book = useLibraryStore((s) => s.books.find((b) => b.id === bookId));
  const updateBook = useLibraryStore((s) => s.updateBook);
  const setProgress = useReaderStore((s) => s.setProgress);
  const setChapterMeta = useReaderStore((s) => s.setChapter);
  const setGoToCfiFn = useReaderStore((s) => s.setGoToCfiFn);
  const pushHistory = useReaderStore((s) => s.pushHistory);
  const readerTab = useReaderStore((s) => s.tabs[tabId]);
  const readSettings = useSettingsStore((s) => s.readSettings);

  const novelId = useMemo(() => parseCodexNovelBookId(bookId), [bookId]);
  const [chapterNumber, setChapterNumber] = useState(1);
  const [chapter, setChapter] = useState<LoadedChapter | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tocItems, setTocItems] = useState<TOCItem[]>([]);
  const [showToc, setShowToc] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showTTS, setShowTTS] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isToolbarPinned, setIsToolbarPinned] = useState(() => {
    try {
      return window.localStorage.getItem(TOOLBAR_PIN_STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });

  // Search (current chapter only)
  const [searchQuery, setSearchQuery] = useState("");
  const [searchHits, setSearchHits] = useState<SearchHit[]>([]);
  const [searchIndex, setSearchIndex] = useState(0);

  // Translation injection (React-side, not foliate DOM)
  const [translationMap, setTranslationMap] = useState<Map<string, string>>(() => new Map());
  const [originalVisible, setOriginalVisible] = useState(true);
  const [translationVisible, setTranslationVisible] = useState(true);

  // TTS continuous chapter turn
  const [ttsContinuousEnabled, setTtsContinuousEnabled] = useState(true);
  const [ttsLastText, setTtsLastText] = useState("");
  const [ttsSegments, setTtsSegments] = useState<string[]>([]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef(0);
  const chapterRef = useRef(chapterNumber);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoveringChromeRef = useRef(false);
  const ttsContinuousRef = useRef(true);
  const pendingTtsAfterLoadRef = useRef(false);
  const startChapterTTSRef = useRef<() => void>(() => {});
  const effectiveNextRef = useRef<number | null>(null);
  chapterRef.current = chapterNumber;
  ttsContinuousRef.current = ttsContinuousEnabled;

  const tocPanel = useResizablePanel({
    storageKey: "reader-toc-panel-width",
    defaultWidth: 280,
    minWidth: 220,
    maxWidth: 420,
  });
  const chatPanel = useResizablePanel({
    storageKey: "reader-chat-panel-width",
    defaultWidth: 320,
    minWidth: 200,
    maxWidth: 600,
  });

  const paragraphs = useMemo(() => chapterParagraphs(chapter), [chapter]);
  const lastChapterNumber =
    book?.meta.totalChapters || chapter?.chapterNumber || tocItems.length || chapterNumber;

  const fontTheme = getFontTheme(readSettings.fontTheme || "system");
  // readSettings.paragraphSpacing / pageMargin are stored as px (same as FoliateViewer).
  const articleStyle = useMemo((): CSSProperties => {
    const margin = Math.max(8, readSettings.pageMargin ?? 40);
    const fontFamily =
      readSettings.customFontFamily ||
      [fontTheme.serif, fontTheme.cjk, "system-ui", "serif"].filter(Boolean).join(", ");
    return {
      fontSize: `${readSettings.fontSize ?? 16}px`,
      lineHeight: String(readSettings.lineHeight ?? 1.6),
      fontFamily,
      // Keep a readable column width; side padding follows pageMargin (px).
      maxWidth: `${Math.min(820, 640 + margin)}px`,
      paddingLeft: margin,
      paddingRight: margin,
    };
  }, [
    fontTheme.cjk,
    fontTheme.serif,
    readSettings.customFontFamily,
    readSettings.fontSize,
    readSettings.lineHeight,
    readSettings.pageMargin,
  ]);
  // Foliate uses paragraphSpacing as px (default 16); do NOT treat as em.
  const paragraphGapPx = Math.max(0, readSettings.paragraphSpacing ?? 16);

  const ttsPlayState = useTTSStore((s) => s.playState);
  const ttsPlay = useTTSStore((s) => s.play);
  const ttsPause = useTTSStore((s) => s.pause);
  const ttsResume = useTTSStore((s) => s.resume);
  const ttsStop = useTTSStore((s) => s.stop);
  const ttsCurrentText = useTTSStore((s) => s.currentText);
  const ttsConfig = useTTSStore((s) => s.config);
  const ttsUpdateConfig = useTTSStore((s) => s.updateConfig);
  const ttsSetOnEnd = useTTSStore((s) => s.setOnEnd);
  const ttsCurrentChunkIndex = useTTSStore((s) => s.currentChunkIndex);
  const ttsTotalChunks = useTTSStore((s) => s.totalChunks);
  const ttsJumpToChunk = useTTSStore((s) => s.jumpToChunk);
  const ttsSetCurrentBook = useTTSStore((s) => s.setCurrentBook);
  const ttsSetCurrentLocation = useTTSStore((s) => s.setCurrentLocation);
  const ttsCurrentBookId = useTTSStore((s) => s.currentBookId);

  const getParagraphsForTranslation = useCallback(() => {
    return paragraphs.map((text, i) => ({
      id: `para_${i}`,
      text,
      tagName: "p",
    }));
  }, [paragraphs]);

  const injectTranslations = useCallback(
    (
      results: ChapterTranslationResult[],
      visibility?: { originalVisible: boolean; translationVisible: boolean },
    ) => {
      setTranslationMap((prev) => {
        const next = new Map(prev);
        for (const r of results) {
          if (r.translatedText) next.set(r.paragraphId, r.translatedText);
        }
        return next;
      });
      if (visibility) {
        setOriginalVisible(visibility.originalVisible);
        setTranslationVisible(visibility.translationVisible);
      }
    },
    [],
  );

  const removeTranslations = useCallback(() => {
    setTranslationMap(new Map());
    setOriginalVisible(true);
    setTranslationVisible(true);
  }, []);

  const applyVisibility = useCallback((orig: boolean, trans: boolean) => {
    setOriginalVisible(orig);
    setTranslationVisible(trans);
  }, []);

  const chapterTranslation = useChapterTranslation({
    bookId,
    sectionIndex: Math.max(0, chapterNumber - 1),
    ready: !!chapter && !loading,
    getParagraphs: getParagraphsForTranslation,
    injectTranslations,
    removeTranslations,
    applyVisibility,
    getCurrentCfi: () => encodeCodexNovelCfi(chapterRef.current, offsetRef.current),
    goToCfi: (cfi) => {
      const decoded = decodeCodexNovelCfi(cfi);
      if (!decoded) return;
      offsetRef.current = decoded.offsetRatio ?? 0;
      const el = scrollRef.current;
      if (el) {
        const max = el.scrollHeight - el.clientHeight;
        el.scrollTop = max > 0 ? max * offsetRef.current : 0;
      }
    },
  });

  // Reset translation UI when chapter number changes (hook also auto-restores cache)
  useEffect(() => {
    void chapterTranslation.reset();
    setSearchHits([]);
    setSearchIndex(0);
    setSearchQuery("");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on chapter change
  }, [chapterNumber]);

  const persistLocal = useCallback(
    (ch: number, offsetRatio: number) => {
      const cfi = encodeCodexNovelCfi(ch, offsetRatio);
      const progress = progressRatioFromChapter(ch, lastChapterNumber, offsetRatio);
      void updateBook(bookId, {
        progress,
        currentCfi: cfi,
        lastOpenedAt: Date.now(),
      });
      setProgress(tabId, progress, cfi);
    },
    [bookId, lastChapterNumber, setProgress, tabId, updateBook],
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

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const keepChrome =
    showSearch || showToc || showSettings || showChat || showTTS || isToolbarPinned;

  const scheduleHide = useCallback(() => {
    if (keepChrome || hoveringChromeRef.current) return;
    clearHideTimer();
    hideTimerRef.current = setTimeout(() => setControlsVisible(false), 2000);
  }, [clearHideTimer, keepChrome]);

  const showControls = useCallback(() => {
    setControlsVisible(true);
    scheduleHide();
  }, [scheduleHide]);

  const handleChromeEnter = useCallback(() => {
    hoveringChromeRef.current = true;
    clearHideTimer();
    setControlsVisible(true);
  }, [clearHideTimer]);

  const handleChromeLeave = useCallback(() => {
    hoveringChromeRef.current = false;
    scheduleHide();
  }, [scheduleHide]);

  useEffect(() => {
    try {
      window.localStorage.setItem(TOOLBAR_PIN_STORAGE_KEY, isToolbarPinned ? "1" : "0");
    } catch {
      // ignore
    }
    if (isToolbarPinned) {
      setControlsVisible(true);
      clearHideTimer();
    } else {
      scheduleHide();
    }
  }, [clearHideTimer, isToolbarPinned, scheduleHide]);

  useEffect(() => {
    if (keepChrome) {
      setControlsVisible(true);
      clearHideTimer();
    } else {
      scheduleHide();
    }
  }, [clearHideTimer, keepChrome, scheduleHide]);

  // Resolve initial chapter from local CFI / cloud progress
  useEffect(() => {
    if (!novelId) return;
    let cancelled = false;

    (async () => {
      await flushProgressQueue();
      try {
        await applyCodexNovelTocDelta(novelId);
      } catch {
        // offline
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
        // offline
      }

      if (cancelled) return;
      offsetRef.current = startOff;
      setChapterNumber(startCh);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [novelId, bookId]);

  // Load full TOC for native TOC panel
  useEffect(() => {
    if (!novelId) return;
    let cancelled = false;
    (async () => {
      try {
        const items = await loadAllToc(novelId);
        if (!cancelled) setTocItems(items);
      } catch {
        if (!cancelled) setTocItems([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [novelId]);

  const loadChapter = useCallback(
    async (ch: number) => {
      if (!novelId) return;
      setLoading(true);
      setError(null);
      try {
        const data = await loadCodexNovelChapter(novelId, ch);
        setChapter(data);
        const title = data.title || `第 ${ch} 章`;
        setChapterMeta(tabId, ch - 1, title, chapterHref(ch));
        const progress = progressRatioFromChapter(ch, lastChapterNumber, offsetRef.current);
        setProgress(tabId, progress, encodeCodexNovelCfi(ch, offsetRef.current));
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
    [lastChapterNumber, novelId, setChapterMeta, setProgress, tabId],
  );

  useEffect(() => {
    if (!novelId) return;
    void loadChapter(chapterNumber);
  }, [chapterNumber, loadChapter, novelId]);

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

  // Push reading context for AI chat
  useEffect(() => {
    if (!chapter) return;
    const surrounding = paragraphs.join("\n").slice(0, 2000);
    const progress = progressRatioFromChapter(
      chapterNumber,
      lastChapterNumber,
      offsetRef.current,
    );
    void readingContextService.updateContext({
      bookId,
      bookTitle: book?.meta.title || "",
      currentChapter: {
        index: chapterNumber - 1,
        title: chapter.title || `第 ${chapterNumber} 章`,
        href: chapterHref(chapterNumber),
      },
      currentPosition: {
        cfi: encodeCodexNovelCfi(chapterNumber, offsetRef.current),
        percentage: progress * 100,
        page: chapterNumber,
      },
      surroundingText: surrounding,
      operationType: "reading",
    });
  }, [
    book?.meta.title,
    bookId,
    chapter,
    chapterNumber,
    lastChapterNumber,
    paragraphs,
  ]);

  useEffect(() => {
    const onHide = () => flushSave();
    window.addEventListener("pagehide", onHide);
    window.addEventListener("beforeunload", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("beforeunload", onHide);
      flushSave();
      clearHideTimer();
      // Stop TTS only if this book owns the session
      const tts = useTTSStore.getState();
      if (tts.currentBookId === bookId) {
        tts.setOnEnd(null);
        tts.stop();
      }
    };
  }, [bookId, clearHideTimer, flushSave]);

  const goChapter = useCallback(
    (next: number | null | undefined, options?: { fromHistory?: boolean }) => {
      if (!next || next < 1 || next === chapterRef.current) return;
      if (!options?.fromHistory) {
        pushHistory(tabId, {
          cfi: encodeCodexNovelCfi(chapterRef.current, offsetRef.current),
          chapterIndex: chapterRef.current - 1,
          chapterTitle: chapter?.title || "",
        });
      }
      flushSave();
      offsetRef.current = 0;
      setChapterNumber(next);
      showControls();
    },
    [chapter?.title, flushSave, pushHistory, showControls, tabId],
  );

  const goToCfi = useCallback(
    (cfi: string) => {
      const decoded = decodeCodexNovelCfi(cfi);
      if (!decoded?.chapterNumber) return;
      offsetRef.current = decoded.offsetRatio ?? 0;
      if (decoded.chapterNumber === chapterRef.current) {
        const el = scrollRef.current;
        if (el) {
          const max = el.scrollHeight - el.clientHeight;
          el.scrollTop = max > 0 ? max * offsetRef.current : 0;
        }
        return;
      }
      goChapter(decoded.chapterNumber, { fromHistory: true });
    },
    [goChapter],
  );

  useEffect(() => {
    setGoToCfiFn(goToCfi);
    return () => setGoToCfiFn(null);
  }, [goToCfi, setGoToCfiFn]);

  const effectivePrev = chapter?.prev ?? (chapterNumber > 1 ? chapterNumber - 1 : null);
  const effectiveNext =
    chapter?.next !== undefined && chapter?.next !== null
      ? chapter.next
      : chapter
        ? chapterNumber + 1
        : null;
  effectiveNextRef.current = effectiveNext;

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    const ratio = max > 0 ? el.scrollTop / max : 0;
    offsetRef.current = Math.max(0, Math.min(1, ratio));
    throttledSave(chapterRef.current, offsetRef.current);
  };

  const handleGoToChapter = useCallback(
    (href: string) => {
      const n = parseChapterHref(href);
      if (n) goChapter(n);
    },
    [goChapter],
  );

  const handleContentClick = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("button, a, input, textarea, mark")) return;
      if (controlsVisible && !keepChrome) {
        setControlsVisible(false);
        clearHideTimer();
      } else {
        showControls();
      }
    },
    [clearHideTimer, controlsVisible, keepChrome, showControls],
  );

  // ── Search ──────────────────────────────────────────────────────────────
  const scrollToSearchHit = useCallback((index: number) => {
    requestAnimationFrame(() => {
      const el = scrollRef.current?.querySelector(
        `[data-search-hit="${index}"]`,
      ) as HTMLElement | null;
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  }, []);

  const handleSearch = useCallback(
    (query: string) => {
      setSearchQuery(query);
      const hits = findChapterHits(paragraphs, query);
      setSearchHits(hits);
      setSearchIndex(0);
      if (hits.length > 0) {
        scrollToSearchHit(0);
      }
    },
    [paragraphs, scrollToSearchHit],
  );

  const navigateSearch = useCallback(
    (dir: "next" | "prev") => {
      if (searchHits.length === 0) return;
      setSearchIndex((prev) => {
        const next =
          dir === "next"
            ? (prev + 1) % searchHits.length
            : (prev - 1 + searchHits.length) % searchHits.length;
        scrollToSearchHit(next);
        return next;
      });
    },
    [scrollToSearchHit, searchHits.length],
  );

  // Re-run search when chapter paragraphs change if query still open
  useEffect(() => {
    if (!showSearch || !searchQuery.trim()) return;
    const hits = findChapterHits(paragraphs, searchQuery);
    setSearchHits(hits);
    setSearchIndex(0);
  }, [paragraphs, searchQuery, showSearch]);

  // ── TTS ─────────────────────────────────────────────────────────────────
  const startChapterTTS = useCallback(() => {
    const segs = paragraphs.map((p) => p.trim()).filter(Boolean);
    if (!segs.length) {
      toast.error(t("tts.noTextFound", "当前没有可朗读的文本"));
      return;
    }
    const joined = segs.join(" ");
    setTtsLastText(joined);
    setTtsSegments(segs);
    ttsSetCurrentBook(book?.meta.title ?? "", chapter?.title ?? "", bookId);
    ttsSetCurrentLocation(encodeCodexNovelCfi(chapterRef.current, offsetRef.current));
    ttsSetOnEnd(() => {
      if (!ttsContinuousRef.current) return;
      const next = effectiveNextRef.current;
      if (next && next > chapterRef.current) {
        pendingTtsAfterLoadRef.current = true;
        goChapter(next);
      }
    });
    setShowTTS(true);
    ttsPlay(segs);
  }, [
    book?.meta.title,
    bookId,
    chapter?.title,
    goChapter,
    paragraphs,
    t,
    ttsPlay,
    ttsSetCurrentBook,
    ttsSetCurrentLocation,
    ttsSetOnEnd,
  ]);
  startChapterTTSRef.current = startChapterTTS;

  // Auto-continue TTS after chapter load
  useEffect(() => {
    if (!chapter || loading) return;
    if (!pendingTtsAfterLoadRef.current) return;
    pendingTtsAfterLoadRef.current = false;
    // slight delay so DOM/scroll settle
    const timer = window.setTimeout(() => startChapterTTSRef.current(), 200);
    return () => window.clearTimeout(timer);
  }, [chapter, loading]);

  const handleToggleTTS = useCallback(() => {
    if (showTTS) {
      setShowTTS(false);
      return;
    }
    const hasActiveSession =
      ttsCurrentBookId === bookId &&
      (ttsPlayState !== "stopped" || !!(ttsCurrentText || ttsLastText).trim());
    const isPlaying = ttsPlayState === "playing" || ttsPlayState === "loading";
    if (hasActiveSession && isPlaying) {
      setShowTTS(true);
      return;
    }
    startChapterTTS();
  }, [
    bookId,
    showTTS,
    startChapterTTS,
    ttsCurrentBookId,
    ttsCurrentText,
    ttsLastText,
    ttsPlayState,
  ]);

  const handleTTSPlayPause = useCallback(() => {
    if (ttsPlayState === "loading" || ttsPlayState === "playing") {
      ttsPause();
      return;
    }
    if (ttsPlayState === "paused") {
      ttsResume();
      return;
    }
    startChapterTTS();
  }, [startChapterTTS, ttsPause, ttsPlayState, ttsResume]);

  const handleAdjustTTSRate = useCallback(
    (delta: number) => {
      const next = Math.max(0.5, Math.min(2, (ttsConfig.rate ?? 1) + delta));
      ttsUpdateConfig({ rate: next });
    },
    [ttsConfig.rate, ttsUpdateConfig],
  );

  const handleAdjustTTSPitch = useCallback(
    (delta: number) => {
      const next = Math.max(0.5, Math.min(2, (ttsConfig.pitch ?? 1) + delta));
      ttsUpdateConfig({ pitch: next });
    },
    [ttsConfig.pitch, ttsUpdateConfig],
  );

  const handleNavigateCitation = useCallback(
    (citation: CitationPart) => {
      if (citation.cfi) {
        goToCfi(citation.cfi);
        return;
      }
      if (typeof citation.chapterIndex === "number" && citation.chapterIndex >= 0) {
        goChapter(citation.chapterIndex + 1);
      }
    },
    [goChapter, goToCfi],
  );

  // Search hit groups for rendering
  const hitsByPara = useMemo(() => {
    const map = new Map<number, { hits: SearchHit[]; base: number }>();
    let base = 0;
    const byPara = new Map<number, SearchHit[]>();
    for (const hit of searchHits) {
      const list = byPara.get(hit.paraIndex) || [];
      list.push(hit);
      byPara.set(hit.paraIndex, list);
    }
    for (const [paraIndex, hits] of byPara) {
      map.set(paraIndex, { hits, base });
      base += hits.length;
    }
    return map;
  }, [searchHits]);

  const toolbarVisible = controlsVisible || keepChrome;
  const totalPages = Math.max(1, lastChapterNumber);
  const currentPage = Math.min(totalPages, Math.max(1, chapterNumber));
  const narrationSegments = useMemo(
    () =>
      (ttsSegments.length > 0 ? ttsSegments : (ttsCurrentText || ttsLastText || "").split(/\n+/))
        .map((text) => text.trim())
        .filter(Boolean)
        .map((text) => ({ text, cfi: null as string | null })),
    [ttsCurrentText, ttsLastText, ttsSegments],
  );

  if (!novelId) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {t("codexnovel.invalidBook", "无效的在线书籍")}
      </div>
    );
  }

  if (!readerTab) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {t("common.loading", "加载中…")}
      </div>
    );
  }

  return (
    <div className="flex h-full bg-muted/30 p-1">
      {showToc && (
        <div
          className="relative mr-1 flex shrink-0 flex-col overflow-hidden rounded-lg border border-border/60 bg-background shadow-sm"
          style={{ width: tocPanel.width }}
        >
          <ResizeHandle
            side="right"
            onResizeStart={tocPanel.handleResizeStart}
            onResize={(delta) => tocPanel.handleResize(delta, "right")}
            onResizeEnd={tocPanel.handleResizeEnd}
          />
          <TOCPanel
            tocItems={tocItems}
            onGoToChapter={handleGoToChapter}
            onGoToCfi={goToCfi}
            onClose={() => setShowToc(false)}
            tabId={tabId}
            bookId={bookId}
            bookTitle={book?.meta.title}
            chapterTitle={chapter?.title || readerTab.chapterTitle}
          />
        </div>
      )}

      <div
        ref={containerRef}
        className="relative flex flex-1 flex-col overflow-hidden rounded-lg border border-border/60 bg-background shadow-sm"
      >
        {/* Top hover strip to reveal toolbar */}
        <div
          className="absolute inset-x-0 top-0 z-30 h-3"
          onMouseEnter={() => {
            showControls();
          }}
        />

        {showSearch && (
          <div className="relative z-20 shrink-0">
            <SearchBar
              onSearch={handleSearch}
              onNext={() => navigateSearch("next")}
              onPrev={() => navigateSearch("prev")}
              onClose={() => {
                setShowSearch(false);
                setSearchHits([]);
                setSearchIndex(0);
                setSearchQuery("");
              }}
              resultCount={searchHits.length}
              currentIndex={searchIndex}
            />
            <p className="border-b border-border/40 bg-muted/40 px-4 py-1 text-[11px] text-muted-foreground">
              {t("codexnovel.searchChapterOnly", "在线阅读仅支持搜索当前章节正文")}
            </p>
          </div>
        )}

        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-y-auto pb-16 pt-12"
          onScroll={onScroll}
          onClick={handleContentClick}
          onMouseMove={() => {
            if (!controlsVisible) showControls();
          }}
        >
          {loading && !chapter ? (
            <div className="flex justify-center py-20 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : error && !chapter ? (
            <div className="mx-auto max-w-prose py-16 text-center text-sm text-destructive">
              {error}
            </div>
          ) : (
            <article className="mx-auto" style={articleStyle}>
              <h1
                className="mb-6 font-semibold leading-snug"
                style={{ fontSize: "1.25em" }}
              >
                {chapter?.title}
                {chapter?.fromCache ? (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    · {t("codexnovel.cached", "缓存")}
                  </span>
                ) : null}
              </h1>
              <div
                style={{ display: "flex", flexDirection: "column", gap: `${paragraphGapPx}px` }}
              >
                {paragraphs.map((p, i) => {
                  const paraId = `para_${i}`;
                  const translated = translationMap.get(paraId);
                  const paraHits = hitsByPara.get(i);
                  return (
                    <div key={`${chapter?.chapterNumber}-${i}`} data-para-index={i}>
                      {originalVisible ? (
                        <p className="text-foreground/90">
                          {paraHits
                            ? renderHighlightedParagraph(
                                p,
                                paraHits.hits,
                                searchIndex,
                                paraHits.base,
                              )
                            : p}
                        </p>
                      ) : null}
                      {translationVisible && translated ? (
                        <div
                          className="readany-translation mt-1 border-l-2 border-border pl-2 text-[0.9em] leading-relaxed text-muted-foreground opacity-90"
                          data-para-id={paraId}
                          data-solo={String(!originalVisible && translationVisible)}
                        >
                          {translated}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              {loading ? (
                <div className="mt-6 flex justify-center text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              ) : null}
            </article>
          )}
        </div>

        <ReaderToolbar
          tabId={tabId}
          isVisible={toolbarVisible}
          onPrev={() => goChapter(effectivePrev)}
          onNext={() => goChapter(effectiveNext)}
          tocItems={tocItems}
          onGoToChapter={handleGoToChapter}
          onToggleToc={() => setShowToc((v) => !v)}
          onToggleSearch={() => {
            setShowSearch((v) => !v);
            setShowSettings(false);
          }}
          onToggleSettings={() => {
            setShowSettings((v) => !v);
            setShowSearch(false);
          }}
          onToggleChat={() => setShowChat((v) => !v)}
          onToggleTTS={handleToggleTTS}
          chapterTranslationState={chapterTranslation.state}
          onChapterTranslationStart={chapterTranslation.startTranslation}
          onChapterTranslationCancel={chapterTranslation.cancelTranslation}
          onToggleOriginalVisible={chapterTranslation.toggleOriginalVisible}
          onToggleTranslationVisible={chapterTranslation.toggleTranslationVisible}
          onChapterTranslationReset={chapterTranslation.reset}
          isChatOpen={showChat}
          isTTSActive={showTTS || ttsPlayState !== "stopped"}
          isPinned={isToolbarPinned}
          onTogglePinned={() => setIsToolbarPinned((p) => !p)}
          onMouseEnter={handleChromeEnter}
          onMouseLeave={handleChromeLeave}
          getPageSnippet={() => {
            const text = paragraphs.join(" ") || chapter?.content || "";
            return text.slice(0, 120);
          }}
        />

        <FooterBar
          tabId={tabId}
          totalPages={totalPages}
          currentPage={currentPage}
          isVisible={toolbarVisible}
          onPrev={() => goChapter(effectivePrev)}
          onNext={() => goChapter(effectiveNext)}
          onSeek={(fraction) => {
            const target = Math.max(
              1,
              Math.min(totalPages, Math.round(fraction * (totalPages - 1)) + 1),
            );
            goChapter(target);
          }}
          onMouseEnter={handleChromeEnter}
          onMouseLeave={handleChromeLeave}
        />

        <TTSPage
          visible={showTTS}
          bookTitle={book?.meta.title || ""}
          chapterTitle={chapter?.title || readerTab.chapterTitle || ""}
          playState={ttsPlayState}
          currentText={ttsCurrentText || ttsLastText}
          config={ttsConfig}
          readingProgress={readerTab.progress ?? 0}
          currentPage={currentPage}
          totalPages={totalPages}
          sourceLabel={t("tts.fromCurrentPage", "当前章节")}
          continuousEnabled={ttsContinuousEnabled}
          narrationSegments={narrationSegments}
          prevNarrationSegments={[]}
          currentChunkIndex={ttsCurrentChunkIndex}
          totalChunks={ttsTotalChunks}
          onClose={() => setShowTTS(false)}
          onReturnToReading={() => setShowTTS(false)}
          onReplay={startChapterTTS}
          onPlayPause={handleTTSPlayPause}
          onStop={() => {
            ttsContinuousRef.current = false;
            setTtsContinuousEnabled(false);
            ttsSetOnEnd(null);
            ttsStop();
          }}
          onAdjustRate={handleAdjustTTSRate}
          onAdjustPitch={handleAdjustTTSPitch}
          onToggleContinuous={() => {
            setTtsContinuousEnabled((v) => {
              const next = !v;
              ttsContinuousRef.current = next;
              if (next && ttsPlayState !== "stopped") {
                ttsSetOnEnd(() => {
                  if (!ttsContinuousRef.current) return;
                  const n = effectiveNextRef.current;
                  if (n && n > chapterRef.current) {
                    pendingTtsAfterLoadRef.current = true;
                    goChapter(n);
                  }
                });
              } else {
                ttsSetOnEnd(null);
              }
              return next;
            });
          }}
          onJumpToSegment={(idx) => ttsJumpToChunk(idx)}
          onUpdateConfig={ttsUpdateConfig}
          onPrevChapter={
            effectivePrev
              ? () => {
                  pendingTtsAfterLoadRef.current = true;
                  goChapter(effectivePrev);
                }
              : undefined
          }
          onNextChapter={
            effectiveNext
              ? () => {
                  pendingTtsAfterLoadRef.current = true;
                  goChapter(effectiveNext);
                }
              : undefined
          }
        />

        {/* Settings overlay */}
        {showSettings && (
          <>
            <div
              className="absolute inset-0 z-40 bg-black/20"
              onClick={() => setShowSettings(false)}
            />
            <div className="absolute top-12 right-2 z-50 w-80 animate-in slide-in-from-top-2 duration-200 rounded-lg border border-border/60 bg-background shadow-lg">
              <div className="flex items-center justify-between border-b border-border/40 px-4 py-2">
                <span className="text-xs font-medium">{t("settings.reading_title")}</span>
                <button
                  type="button"
                  className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={() => setShowSettings(false)}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="max-h-[70vh] overflow-y-auto">
                <p className="border-b border-border/30 px-4 py-2 text-[11px] text-muted-foreground">
                  {t(
                    "codexnovel.settingsNote",
                    "字号 / 行距 / 字体 / 边距对在线阅读生效；分页与双页布局仅本地书有效。",
                  )}
                </p>
                <ReadSettingsPanel />
              </div>
            </div>
          </>
        )}

        {/* Thin progress bar */}
        <div className="absolute bottom-0 left-0 right-0 z-20 h-[2px] bg-foreground/5">
          <div
            className="h-full bg-primary/30 transition-all duration-300 ease-out"
            style={{ width: `${Math.round((readerTab.progress ?? 0) * 100)}%` }}
          />
        </div>
      </div>

      {/* AI Chat sidebar */}
      {showChat && (
        <div
          className="relative ml-1 flex shrink-0 flex-col overflow-hidden rounded-lg border border-border/60 bg-background shadow-sm"
          style={{ width: chatPanel.width }}
        >
          <ResizeHandle
            side="left"
            onResizeStart={chatPanel.handleResizeStart}
            onResize={(delta) => chatPanel.handleResize(delta, "left")}
            onResizeEnd={chatPanel.handleResizeEnd}
          />
          <div className="flex h-10 shrink-0 items-center justify-between border-b border-border/40 px-3">
            <span className="text-xs font-medium text-foreground">{t("chat.aiAssistant")}</span>
            <button
              type="button"
              className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              onClick={() => setShowChat(false)}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="border-b border-border/30 px-3 py-1.5 text-[11px] text-muted-foreground">
            {t(
              "codexnovel.aiContextNote",
              "已带入当前章节上下文。全书语义检索需本地向量化，在线书暂不支持。",
            )}
          </p>
          <div className="flex-1 overflow-hidden">
            <ChatPanel book={book} onNavigateToCitation={handleNavigateCitation} />
          </div>
        </div>
      )}
    </div>
  );
}
