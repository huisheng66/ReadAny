/**
 * CodexNovelLibraryScreen — browse remote books + shelf (mobile).
 */
import type { RootStackParamList } from "@/navigation/RootNavigator";
import { useLibraryStore } from "@/stores/library-store";
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
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
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
import { SettingsHeader } from "../settings/SettingsHeader";

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function CodexNovelLibraryScreen() {
  const colors = useColors();
  const styles = makeStyles(colors);
  const { t } = useTranslation();
  const navigation = useNavigation<Nav>();
  const loadBooks = useLibraryStore((s) => s.loadBooks);

  const [ready, setReady] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [baseUrl, setBaseUrl] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [items, setItems] = useState<CodexNovelBookSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const pageSize = 20;

  useEffect(() => {
    void (async () => {
      const [url, ok] = await Promise.all([getStoredBaseUrl(), isCodexNovelLoggedIn()]);
      setBaseUrl(url);
      setLoggedIn(ok);
      setReady(true);
    })();
  }, []);

  const load = useCallback(async () => {
    if (!loggedIn) return;
    setLoading(true);
    try {
      const data = await listCodexNovelBooks({ q: q.trim() || undefined, page, pageSize });
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch (err) {
      Alert.alert(
        t("common.error", "错误"),
        err instanceof CodexNovelError ? err.message : String(err),
      );
    } finally {
      setLoading(false);
    }
  }, [loggedIn, page, q, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!loggedIn) return;
    void checkCodexNovelShelfUpdates().catch(() => {});
  }, [loggedIn]);

  if (!ready) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={["top"]}>
        <SettingsHeader title={t("codexnovel.store", "在线书城")} />
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (!baseUrl || !loggedIn) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={["top"]}>
        <SettingsHeader title={t("codexnovel.store", "在线书城")} />
        <View style={styles.center}>
          <Text style={styles.centerText}>
            {t(
              "codexnovel.needLogin",
              "请先在设置中配置 CodexNovel 服务器地址并登录，再浏览在线书城。",
            )}
          </Text>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => navigation.navigate("CodexNovelSettings")}
          >
            <Text style={styles.primaryBtnText}>
              {t("codexnovel.openSettings", "打开在线书库设置")}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={["top"]}>
      <SettingsHeader title={t("codexnovel.store", "在线书城")} />
      <View style={styles.toolbar}>
        <TextInput
          style={styles.search}
          value={q}
          onChangeText={(v) => {
            setPage(1);
            setQ(v);
          }}
          placeholder={t("codexnovel.searchPlaceholder", "搜索书名 / 作者")}
          placeholderTextColor={colors.mutedForeground}
        />
        <TouchableOpacity
          style={styles.smallBtn}
          onPress={() =>
            void (async () => {
              setLoading(true);
              try {
                const result = await syncCodexNovelShelfToLibrary();
                await checkCodexNovelShelfUpdates().catch(() => {});
                await loadBooks();
                Alert.alert(
                  t("common.success", "成功"),
                  t("codexnovel.shelfSynced", {
                    added: result.added,
                    updated: result.updated,
                  }),
                );
              } catch (err) {
                Alert.alert(
                  t("common.error", "错误"),
                  err instanceof CodexNovelError ? err.message : String(err),
                );
              } finally {
                setLoading(false);
              }
            })()
          }
        >
          <Text style={styles.smallBtnText}>{t("codexnovel.syncShelf", "同步")}</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.meta} numberOfLines={1}>
        {baseUrl}
      </Text>

      {loading && items.length === 0 ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xxl * 2 }}
          ListEmptyComponent={
            <Text style={styles.centerText}>{t("codexnovel.emptyBooks", "暂无书籍")}</Text>
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cover}>
                {item.coverUrl ? (
                  <Image source={{ uri: item.coverUrl }} style={styles.coverImg} />
                ) : (
                  <View style={styles.coverPlaceholder} />
                )}
              </View>
              <View style={styles.cardBody}>
                <Text style={styles.title} numberOfLines={2}>
                  {item.title}
                </Text>
                <Text style={styles.author} numberOfLines={1}>
                  {item.author || "—"}
                </Text>
                <Text style={styles.chapter}>
                  {t("codexnovel.chapterCount", "{{count}} 章", {
                    count: item.chapterCount ?? item.lastChapterNumber ?? 0,
                  })}
                </Text>
                <View style={styles.actions}>
                  <TouchableOpacity
                    style={styles.primaryBtnSm}
                    onPress={() =>
                      void (async () => {
                        try {
                          await addCodexNovelToShelf(item.id);
                          await syncCodexNovelShelfToLibrary();
                          await loadBooks();
                          Alert.alert(
                            t("common.success", "成功"),
                            t("codexnovel.addedToShelf", "已加入书架"),
                          );
                        } catch (err) {
                          Alert.alert(
                            t("common.error", "错误"),
                            err instanceof CodexNovelError ? err.message : String(err),
                          );
                        }
                      })()
                    }
                  >
                    <Text style={styles.primaryBtnText}>
                      {t("codexnovel.addShelf", "加书架")}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.ghostBtn}
                    onPress={() =>
                      void (async () => {
                        try {
                          await removeCodexNovelFromShelf(item.id);
                          await removeCodexNovelFromLocalLibrary(item.id);
                          await loadBooks();
                        } catch (err) {
                          Alert.alert(
                            t("common.error", "错误"),
                            err instanceof CodexNovelError ? err.message : String(err),
                          );
                        }
                      })()
                    }
                  >
                    <Text style={styles.ghostBtnText}>
                      {t("codexnovel.removeShelf", "移出")}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}
          ListFooterComponent={
            <View style={styles.pager}>
              <Text style={styles.meta}>
                {t("codexnovel.pageInfo", {
                  page,
                  totalPages,
                  total,
                })}
              </Text>
              <View style={styles.actions}>
                <TouchableOpacity
                  style={styles.ghostBtn}
                  disabled={page <= 1 || loading}
                  onPress={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <Text style={styles.ghostBtnText}>{t("common.back", "上一页")}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.ghostBtn}
                  disabled={page >= totalPages || loading}
                  onPress={() => setPage((p) => p + 1)}
                >
                  <Text style={styles.ghostBtnText}>{t("common.next", "下一页")}</Text>
                </TouchableOpacity>
              </View>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1 },
    toolbar: {
      flexDirection: "row",
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.sm,
      alignItems: "center",
    },
    search: {
      flex: 1,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      color: colors.foreground,
      backgroundColor: colors.card,
      fontSize: fontSize.sm,
    },
    smallBtn: {
      backgroundColor: colors.muted,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.md,
    },
    smallBtnText: { color: colors.foreground, fontSize: fontSize.xs, fontWeight: fontWeight.medium },
    meta: {
      color: colors.mutedForeground,
      fontSize: fontSize.xs,
      paddingHorizontal: spacing.md,
      marginBottom: spacing.sm,
    },
    card: {
      flexDirection: "row",
      gap: spacing.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      borderRadius: radius.lg,
      padding: spacing.md,
      marginBottom: spacing.sm,
      backgroundColor: colors.card,
    },
    cover: { width: 56, height: 80, borderRadius: radius.sm, overflow: "hidden" },
    coverImg: { width: "100%", height: "100%" },
    coverPlaceholder: { flex: 1, backgroundColor: colors.muted },
    cardBody: { flex: 1, minWidth: 0 },
    title: { color: colors.foreground, fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
    author: { color: colors.mutedForeground, fontSize: fontSize.xs, marginTop: 2 },
    chapter: { color: colors.mutedForeground, fontSize: fontSize.xs, marginTop: 4 },
    actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm, flexWrap: "wrap" },
    primaryBtn: {
      backgroundColor: colors.primary,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderRadius: radius.md,
      marginTop: spacing.lg,
    },
    primaryBtnSm: {
      backgroundColor: colors.primary,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.md,
    },
    primaryBtnText: {
      color: colors.primaryForeground || "#fff",
      fontSize: fontSize.sm,
      fontWeight: fontWeight.medium,
    },
    ghostBtn: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    ghostBtnText: { color: colors.foreground, fontSize: fontSize.xs },
    center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
    centerText: {
      color: colors.mutedForeground,
      fontSize: fontSize.sm,
      textAlign: "center",
      lineHeight: 20,
    },
    pager: { paddingVertical: spacing.lg, gap: spacing.sm },
  });
}
