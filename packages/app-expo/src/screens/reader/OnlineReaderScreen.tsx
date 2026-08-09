/**
 * OnlineReaderScreen — chapter-stream reader for CodexNovel (mobile).
 */
import type { RootStackParamList } from "@/navigation/RootNavigator";
import { useLibraryStore } from "@/stores/library-store";
import {
  CodexNovelError,
  applyCodexNovelTocDelta,
  createCodexNovelBookmark,
  decodeCodexNovelCfi,
  encodeCodexNovelCfi,
  flushProgressQueue,
  getCodexNovelProgress,
  loadCodexNovelChapter,
  parseCodexNovelBookId,
  progressRatioFromChapter,
  saveCodexNovelProgress,
  type LoadedChapter,
} from "@readany/core/codexnovel";
import type { RouteProp } from "@react-navigation/native";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  type ThemeColors,
  fontSize,
  fontWeight,
  radius,
  spacing,
  useColors,
} from "../../styles/theme";

type Nav = NativeStackNavigationProp<RootStackParamList>;
type R = RouteProp<RootStackParamList, "OnlineReader">;

export default function OnlineReaderScreen() {
  const colors = useColors();
  const styles = makeStyles(colors);
  const { t } = useTranslation();
  const navigation = useNavigation<Nav>();
  const route = useRoute<R>();
  const { bookId } = route.params;

  const book = useLibraryStore((s) => s.books.find((b) => b.id === bookId));
  const updateBook = useLibraryStore((s) => s.updateBook);
  const novelId = useMemo(() => parseCodexNovelBookId(bookId), [bookId]);

  const [chapterNumber, setChapterNumber] = useState(1);
  const [chapter, setChapter] = useState<LoadedChapter | null>(null);
  const [loading, setLoading] = useState(true);
  const offsetRef = useRef(0);
  const chapterRef = useRef(1);
  const contentHeightRef = useRef(1);
  const layoutHeightRef = useRef(1);
  chapterRef.current = chapterNumber;

  const lastChapterNumber = book?.meta.totalChapters || chapterNumber;

  const persist = useCallback(
    (ch: number, offsetRatio: number) => {
      if (!novelId) return;
      const cfi = encodeCodexNovelCfi(ch, offsetRatio);
      const progress = progressRatioFromChapter(ch, lastChapterNumber, offsetRatio);
      void updateBook(bookId, {
        progress,
        currentCfi: cfi,
        lastOpenedAt: Date.now(),
      });
      void saveCodexNovelProgress({
        novelId,
        chapterNumber: ch,
        offsetRatio,
        updatedAt: new Date().toISOString(),
        deviceName: Platform.OS === "ios" ? "ReadAny iOS" : "ReadAny Android",
      });
    },
    [bookId, lastChapterNumber, novelId, updateBook],
  );

  const flush = useCallback(() => {
    persist(chapterRef.current, offsetRef.current);
  }, [persist]);

  useEffect(() => {
    if (!novelId) return;
    let cancelled = false;
    (async () => {
      await flushProgressQueue();
      try {
        await applyCodexNovelTocDelta(novelId);
      } catch {
        // ignore
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
      flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [novelId, bookId]);

  useEffect(() => {
    if (!novelId) return;
    let cancelled = false;
    setLoading(true);
    void loadCodexNovelChapter(novelId, chapterNumber)
      .then((data) => {
        if (cancelled) return;
        setChapter(data);
        if (data.next) void loadCodexNovelChapter(novelId, data.next).catch(() => {});
      })
      .catch((err) => {
        if (cancelled) return;
        Alert.alert(
          t("common.error", "错误"),
          err instanceof CodexNovelError ? err.message : String(err),
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [chapterNumber, novelId, t]);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    contentHeightRef.current = contentSize.height;
    layoutHeightRef.current = layoutMeasurement.height;
    const max = contentSize.height - layoutMeasurement.height;
    offsetRef.current = max > 0 ? Math.max(0, Math.min(1, contentOffset.y / max)) : 0;
  };

  const goChapter = (next: number | null | undefined) => {
    if (!next || next < 1) return;
    flush();
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
      Alert.alert(t("common.success", "成功"), t("codexnovel.bookmarkAdded", "书签已添加"));
    } catch (err) {
      Alert.alert(
        t("common.error", "错误"),
        err instanceof CodexNovelError ? err.message : String(err),
      );
    }
  };

  if (!novelId) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={styles.error}>{t("codexnovel.invalidBook", "无效的在线书籍")}</Text>
      </SafeAreaView>
    );
  }

  const prev = chapter?.prev ?? (chapterNumber > 1 ? chapterNumber - 1 : null);
  const next = chapter?.next ?? null;
  const paragraphs =
    chapter?.paragraphs?.length
      ? chapter.paragraphs
      : (chapter?.content || "").split(/\n+/).filter(Boolean);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn}>
          <Text style={styles.headerBtnText}>{t("common.back", "返回")}</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {book?.meta.title || "—"}
          </Text>
          <Text style={styles.headerSub} numberOfLines={1}>
            {chapter?.title || t("codexnovel.loadingChapter", "加载章节…")}
            {chapter?.fromCache ? ` · ${t("codexnovel.cached", "缓存")}` : ""}
          </Text>
        </View>
        <TouchableOpacity onPress={() => void addBookmark()} style={styles.headerBtn}>
          <Text style={styles.headerBtnText}>{t("codexnovel.bookmark", "书签")}</Text>
        </TouchableOpacity>
      </View>

      {loading && !chapter ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          onScroll={onScroll}
          scrollEventThrottle={100}
          onMomentumScrollEnd={() => persist(chapterRef.current, offsetRef.current)}
          onScrollEndDrag={() => persist(chapterRef.current, offsetRef.current)}
        >
          <Text style={styles.chapterTitle}>{chapter?.title}</Text>
          {paragraphs.map((p, i) => (
            <Text key={`${chapterNumber}-${i}`} style={styles.paragraph}>
              {p}
            </Text>
          ))}
        </ScrollView>
      )}

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.navBtn, !prev && styles.navBtnDisabled]}
          disabled={!prev || loading}
          onPress={() => goChapter(prev)}
        >
          <Text style={styles.navBtnText}>{t("common.back", "上一章")}</Text>
        </TouchableOpacity>
        <Text style={styles.pageNo}>#{chapterNumber}</Text>
        <TouchableOpacity
          style={[styles.navBtn, !next && styles.navBtnDisabled]}
          disabled={!next || loading}
          onPress={() => goChapter(next)}
        >
          <Text style={styles.navBtnText}>{t("common.next", "下一章")}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1 },
    header: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      gap: spacing.sm,
    },
    headerBtn: { padding: spacing.sm, minWidth: 48 },
    headerBtnText: { color: colors.primary, fontSize: fontSize.sm },
    headerCenter: { flex: 1, minWidth: 0 },
    headerTitle: {
      color: colors.foreground,
      fontSize: fontSize.sm,
      fontWeight: fontWeight.semibold,
      textAlign: "center",
    },
    headerSub: {
      color: colors.mutedForeground,
      fontSize: fontSize.xs,
      textAlign: "center",
      marginTop: 2,
    },
    scroll: { flex: 1 },
    scrollContent: { paddingHorizontal: spacing.xl, paddingVertical: spacing.xl },
    chapterTitle: {
      color: colors.foreground,
      fontSize: fontSize.lg,
      fontWeight: fontWeight.semibold,
      marginBottom: spacing.xl,
      lineHeight: 28,
    },
    paragraph: {
      color: colors.foreground,
      fontSize: 17,
      lineHeight: 30,
      marginBottom: spacing.lg,
    },
    footer: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    navBtn: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    navBtnDisabled: { opacity: 0.4 },
    navBtnText: { color: colors.foreground, fontSize: fontSize.sm },
    pageNo: { color: colors.mutedForeground, fontSize: fontSize.xs },
    error: { color: colors.destructive || "#f44", textAlign: "center", marginTop: 40 },
  });
}
