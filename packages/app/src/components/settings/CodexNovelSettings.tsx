/**
 * CodexNovelSettings — server URL + login for online library.
 */
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import {
  CodexNovelError,
  configureCodexNovelBaseUrl,
  getCodexNovelHealth,
  getCodexNovelSession,
  getStoredBaseUrl,
  getStoredDeviceName,
  loginCodexNovel,
  logoutCodexNovel,
  registerCodexNovel,
  syncCodexNovelShelfToLibrary,
} from "@readany/core/codexnovel";
import { Cloud, LogIn, LogOut, RefreshCw, Server } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useLibraryStore } from "@/stores/library-store";

export function CodexNovelSettings() {
  const { t } = useTranslation();
  const loadBooks = useLibraryStore((s) => s.loadBooks);

  const [baseUrl, setBaseUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [deviceName, setDeviceName] = useState("ReadAny Desktop");
  const [userLabel, setUserLabel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [healthLabel, setHealthLabel] = useState<string | null>(null);

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

  const handleSaveUrl = async () => {
    setBusy(true);
    try {
      const normalized = await configureCodexNovelBaseUrl(baseUrl);
      setBaseUrl(normalized);
      toast.success(t("codexnovel.urlSaved", "服务器地址已保存"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleTest = async () => {
    setBusy(true);
    setHealthLabel(null);
    try {
      if (baseUrl.trim()) {
        await configureCodexNovelBaseUrl(baseUrl);
      }
      const health = await getCodexNovelHealth(baseUrl || undefined);
      setHealthLabel(`${health.status} · api v${health.apiVersion}`);
      toast.success(t("codexnovel.healthOk", "连接成功"));
    } catch (err) {
      const msg = err instanceof CodexNovelError ? err.message : err instanceof Error ? err.message : String(err);
      setHealthLabel(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const handleLogin = async () => {
    setBusy(true);
    try {
      await loginCodexNovel({
        username: username.trim(),
        password,
        deviceName: deviceName.trim() || "ReadAny Desktop",
        baseUrl: baseUrl.trim() || undefined,
      });
      await refreshSession();
      toast.success(t("codexnovel.loginOk", "登录成功"));
    } catch (err) {
      toast.error(err instanceof CodexNovelError ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleRegister = async () => {
    setBusy(true);
    try {
      await registerCodexNovel({
        username: username.trim(),
        password,
        displayName: username.trim(),
        deviceName: deviceName.trim() || "ReadAny Desktop",
        baseUrl: baseUrl.trim() || undefined,
      });
      await refreshSession();
      toast.success(t("codexnovel.registerOk", "注册并登录成功"));
    } catch (err) {
      toast.error(err instanceof CodexNovelError ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleLogout = async () => {
    setBusy(true);
    try {
      await logoutCodexNovel();
      await refreshSession();
      setPassword("");
      toast.success(t("codexnovel.logoutOk", "已退出登录"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleSyncShelf = async () => {
    setBusy(true);
    try {
      const result = await syncCodexNovelShelfToLibrary();
      await loadBooks();
      toast.success(
        t("codexnovel.shelfSynced", "书架已同步：新增 {{added}}，更新 {{updated}}", {
          added: result.added,
          updated: result.updated,
        }),
      );
    } catch (err) {
      toast.error(err instanceof CodexNovelError ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6 p-5">
      <div>
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Cloud className="h-4 w-4" />
          {t("codexnovel.title", "在线书库 (CodexNovel)")}
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {t(
            "codexnovel.desc",
            "连接 codexnovel /api/v1，登录后可浏览书城、同步书架与阅读进度。",
          )}
        </p>
      </div>

      <section className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          <Server className="h-3.5 w-3.5" />
          {t("codexnovel.baseUrl", "服务器地址")}
        </label>
        <Input
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="http://127.0.0.1:3008"
          disabled={busy}
        />
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={handleSaveUrl}>
            {t("common.save", "保存")}
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={handleTest}>
            {t("codexnovel.testConnection", "测试连接")}
          </Button>
        </div>
        {healthLabel ? (
          <p className="text-xs text-muted-foreground">{healthLabel}</p>
        ) : null}
      </section>

      <section className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground">
          {t("codexnovel.account", "账号")}
        </label>
        {userLabel ? (
          <p className="text-sm">
            {t("codexnovel.loggedInAs", "已登录：{{name}}", { name: userLabel })}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            {t("codexnovel.notLoggedIn", "未登录")}
          </p>
        )}
        <Input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder={t("codexnovel.username", "用户名")}
          disabled={busy || Boolean(userLabel)}
          autoComplete="username"
        />
        <PasswordInput
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t("codexnovel.password", "密码")}
          disabled={busy || Boolean(userLabel)}
          autoComplete="current-password"
        />
        <Input
          value={deviceName}
          onChange={(e) => setDeviceName(e.target.value)}
          placeholder={t("codexnovel.deviceName", "设备名")}
          disabled={busy}
        />
        <div className="flex flex-wrap gap-2">
          {userLabel ? (
            <>
              <Button type="button" size="sm" variant="outline" disabled={busy} onClick={handleLogout}>
                <LogOut className="mr-1 h-3.5 w-3.5" />
                {t("codexnovel.logout", "退出")}
              </Button>
              <Button type="button" size="sm" disabled={busy} onClick={handleSyncShelf}>
                <RefreshCw className="mr-1 h-3.5 w-3.5" />
                {t("codexnovel.syncShelf", "同步书架到本地")}
              </Button>
            </>
          ) : (
            <>
              <Button type="button" size="sm" disabled={busy} onClick={handleLogin}>
                <LogIn className="mr-1 h-3.5 w-3.5" />
                {t("codexnovel.login", "登录")}
              </Button>
              <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={handleRegister}>
                {t("codexnovel.register", "注册")}
              </Button>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
