/**
 * CodexNovelSettingsScreen — server URL + login (mobile).
 */
import { useLibraryStore } from "@/stores/library-store";
import {
  CodexNovelError,
  checkCodexNovelClientOps,
  configureCodexNovelBaseUrl,
  getCodexNovelHealth,
  getCodexNovelSession,
  getStoredBaseUrl,
  getStoredDeviceName,
  loginCodexNovel,
  logoutCodexNovel,
  registerCodexNovel,
  registerCodexNovelDevice,
  syncCodexNovelShelfToLibrary,
} from "@readany/core/codexnovel";
import { getPlatformService } from "@readany/core/services";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
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
import { SettingsHeader } from "./SettingsHeader";

export default function CodexNovelSettingsScreen() {
  const colors = useColors();
  const styles = makeStyles(colors);
  const { t } = useTranslation();
  const loadBooks = useLibraryStore((s) => s.loadBooks);

  const [baseUrl, setBaseUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [deviceName, setDeviceName] = useState(
    Platform.OS === "ios" ? "ReadAny iOS" : "ReadAny Android",
  );
  const [userLabel, setUserLabel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [statusText, setStatusText] = useState<string | null>(null);

  const refreshSession = useCallback(async () => {
    const [url, session, dev] = await Promise.all([
      getStoredBaseUrl(),
      getCodexNovelSession(),
      getStoredDeviceName(),
    ]);
    if (url) setBaseUrl(url);
    if (dev) setDeviceName(dev);
    if (session.user) {
      setUserLabel(session.user.displayName || session.user.username);
      setUsername(session.user.username);
    } else {
      setUserLabel(null);
    }
  }, []);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  const afterAuth = async () => {
    await refreshSession();
    try {
      await registerCodexNovelDevice({
        platform: Platform.OS,
        deviceName: deviceName.trim() || "ReadAny Mobile",
      });
    } catch {
      // non-fatal
    }
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      Alert.alert(
        t("common.error", "错误"),
        err instanceof CodexNovelError ? err.message : String(err),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={["top"]}>
      <SettingsHeader title={t("codexnovel.settingsTab", "在线书库")} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.desc}>
          {t(
            "codexnovel.desc",
            "连接 codexnovel /api/v1，登录后可浏览书城、同步书架与阅读进度。",
          )}
        </Text>

        <Text style={styles.label}>{t("codexnovel.baseUrl", "服务器地址")}</Text>
        <TextInput
          style={styles.input}
          value={baseUrl}
          onChangeText={setBaseUrl}
          placeholder="http://192.168.1.10:3008"
          placeholderTextColor={colors.mutedForeground}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!busy}
        />

        <View style={styles.row}>
          <TouchableOpacity
            style={styles.btn}
            disabled={busy}
            onPress={() =>
              void run(async () => {
                const n = await configureCodexNovelBaseUrl(baseUrl);
                setBaseUrl(n);
                Alert.alert(t("common.success", "成功"), t("codexnovel.urlSaved", "服务器地址已保存"));
              })
            }
          >
            <Text style={styles.btnText}>{t("common.save", "保存")}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, styles.btnOutline]}
            disabled={busy}
            onPress={() =>
              void run(async () => {
                if (baseUrl.trim()) await configureCodexNovelBaseUrl(baseUrl);
                const health = await getCodexNovelHealth(baseUrl || undefined);
                setStatusText(`${health.status} · api v${health.apiVersion}`);
                Alert.alert(t("common.success", "成功"), t("codexnovel.healthOk", "连接成功"));
              })
            }
          >
            <Text style={[styles.btnText, styles.btnOutlineText]}>
              {t("codexnovel.testConnection", "测试连接")}
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.btn, styles.btnOutline, { marginTop: spacing.sm }]}
          disabled={busy}
          onPress={() =>
            void run(async () => {
              if (baseUrl.trim()) await configureCodexNovelBaseUrl(baseUrl);
              const version = await getPlatformService().getAppVersion();
              const result = await checkCodexNovelClientOps(version, baseUrl || undefined);
              const parts: string[] = [];
              if (result.announcementText) parts.push(result.announcementText);
              if (result.needsUpdate) {
                parts.push(result.updateMessage || t("codexnovel.needsUpdate", { version }));
              }
              if (!parts.length) parts.push(t("codexnovel.opsOk", "无公告，版本策略正常"));
              setStatusText(parts.join(" · "));
            })
          }
        >
          <Text style={[styles.btnText, styles.btnOutlineText]}>
            {t("codexnovel.checkOps", "公告 / 强更")}
          </Text>
        </TouchableOpacity>

        {statusText ? <Text style={styles.status}>{statusText}</Text> : null}

        <Text style={[styles.label, { marginTop: spacing.xl }]}>
          {t("codexnovel.account", "账号")}
        </Text>
        <Text style={styles.status}>
          {userLabel
            ? t("codexnovel.loggedInAs", "已登录：{{name}}", { name: userLabel })
            : t("codexnovel.notLoggedIn", "未登录")}
        </Text>

        <TextInput
          style={styles.input}
          value={username}
          onChangeText={setUsername}
          placeholder={t("codexnovel.username", "用户名")}
          placeholderTextColor={colors.mutedForeground}
          autoCapitalize="none"
          editable={!busy && !userLabel}
        />
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          placeholder={t("codexnovel.password", "密码")}
          placeholderTextColor={colors.mutedForeground}
          secureTextEntry
          editable={!busy && !userLabel}
        />
        <TextInput
          style={styles.input}
          value={deviceName}
          onChangeText={setDeviceName}
          placeholder={t("codexnovel.deviceName", "设备名")}
          placeholderTextColor={colors.mutedForeground}
          editable={!busy}
        />

        {busy ? <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.md }} /> : null}

        <View style={styles.row}>
          {userLabel ? (
            <>
              <TouchableOpacity
                style={[styles.btn, styles.btnOutline]}
                disabled={busy}
                onPress={() =>
                  void run(async () => {
                    await logoutCodexNovel();
                    setPassword("");
                    await refreshSession();
                  })
                }
              >
                <Text style={[styles.btnText, styles.btnOutlineText]}>
                  {t("codexnovel.logout", "退出")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.btn}
                disabled={busy}
                onPress={() =>
                  void run(async () => {
                    const result = await syncCodexNovelShelfToLibrary();
                    await loadBooks();
                    Alert.alert(
                      t("common.success", "成功"),
                      t("codexnovel.shelfSynced", {
                        added: result.added,
                        updated: result.updated,
                      }),
                    );
                  })
                }
              >
                <Text style={styles.btnText}>{t("codexnovel.syncShelf", "同步书架")}</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity
                style={styles.btn}
                disabled={busy}
                onPress={() =>
                  void run(async () => {
                    await loginCodexNovel({
                      username: username.trim(),
                      password,
                      deviceName: deviceName.trim() || "ReadAny Mobile",
                      baseUrl: baseUrl.trim() || undefined,
                    });
                    await afterAuth();
                  })
                }
              >
                <Text style={styles.btnText}>{t("codexnovel.login", "登录")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, styles.btnOutline]}
                disabled={busy}
                onPress={() =>
                  void run(async () => {
                    await registerCodexNovel({
                      username: username.trim(),
                      password,
                      displayName: username.trim(),
                      deviceName: deviceName.trim() || "ReadAny Mobile",
                      baseUrl: baseUrl.trim() || undefined,
                    });
                    await afterAuth();
                  })
                }
              >
                <Text style={[styles.btnText, styles.btnOutlineText]}>
                  {t("codexnovel.register", "注册")}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1 },
    content: { padding: spacing.lg, paddingBottom: spacing.xxl * 2 },
    desc: {
      color: colors.mutedForeground,
      fontSize: fontSize.sm,
      marginBottom: spacing.lg,
      lineHeight: 20,
    },
    label: {
      color: colors.mutedForeground,
      fontSize: fontSize.xs,
      fontWeight: fontWeight.medium,
      marginBottom: spacing.sm,
    },
    input: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + 2,
      color: colors.foreground,
      fontSize: fontSize.sm,
      marginBottom: spacing.sm,
      backgroundColor: colors.card,
    },
    row: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm },
    btn: {
      backgroundColor: colors.primary,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm + 2,
      borderRadius: radius.md,
    },
    btnOutline: {
      backgroundColor: "transparent",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    btnText: { color: colors.primaryForeground || "#fff", fontSize: fontSize.sm, fontWeight: fontWeight.medium },
    btnOutlineText: { color: colors.foreground },
    status: { color: colors.mutedForeground, fontSize: fontSize.xs, marginTop: spacing.sm },
  });
}
