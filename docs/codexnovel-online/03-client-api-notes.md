# 客户端实现笔记（R0–R4）

## 模块位置

`packages/core/src/codexnovel/` — 平台无关；HTTP 经 `IPlatformService.fetch`，会话经 `kv*`。

| 文件 | 职责 |
|------|------|
| `client.ts` / `auth.ts` / `token-store.ts` | 请求、鉴权、JWT 刷新 |
| `books.ts` / `shelf.ts` / `shelf-sync.ts` | 书库、书架、落本地 books |
| `mapping.ts` / `local-meta.ts` | `cn-{id}`、CFI、旁路表 |
| `cache.ts` / `chapter-loader.ts` | 章缓存 + ETag |
| `progress.ts` | put / batch / 离线队列 |
| `updates.ts` | shelf updates + toc delta |
| `bookmarks.ts` / `ops.ts` / `devices.ts` | R4 |

桌面 UI：`packages/app/src/components/codexnovel/`、`settings/CodexNovelSettings.tsx`。

## 已知限制

1. **移动端 Expo**：API 层已在 core，UI 尚未接 OnlineReader / 书城（R2 优先桌面）。
2. **在线书不走 foliate**：无 EPUB CFI 高亮链；书签用 chapterNumber+offsetRatio。
3. **WebDAV**：`codexnovel://` 文件路径应跳过文件同步（若上传失败可忽略）。
4. **TOC 304 缓存** 时 `next` 可能为空，UI 用 `chapter.next` 控制下一章按钮。
5. **强更**：仅展示策略，不拦截整个 App（与 GitHub 更新检查并存）。
6. **真推送**：设备可注册，通知用轮询 `/me/notices/updates` 与 shelf updates。

## 联调

```bash
# 服务端 codexnovel app 分支
# 客户端
pnpm test:core -- src/codexnovel
CODEXNOVEL_BASE_URL=http://127.0.0.1:3008 node scripts/smoke-codexnovel.mjs
```

桌面：`pnpm tauri dev` → 设置 → 在线书库 → 登录 → 侧栏「在线书城」→ 加书架 → 本地库打开。
