# CodexNovel 在线书库对接 — 架构

> 客户端仓库：`D:\ReadAny`（`huisheng66/ReadAny`，分支 **`main`**）  
> 服务端仓库：`D:\codexnovel`（分支 **`app`**，Base path `/api/v1`）  
> 服务端契约：`codexnovel/docs/api-v1.md`（后端 0–4 期已完成）

## 1. 目标

把 codexnovel 作为 **官方在线书源 + 账号云进度**，在 ReadAny 上实现接近起点的体验：

- 登录账号，浏览书库 / 书架
- 打开连载书，按章拉正文（流式章节，非整本下载）
- 无痛追更：TOC 增量、书架「有更新」、正文 ETag/`contentHash` 缓存
- 进度多端 LWW；离线队列 batch 上报
- 保留 ReadAny 本地书、AI/TTS/WebDAV 等能力，**不替换、不破坏**现有本地阅读路径

## 2. 现状差异（必须正视）

| 维度 | ReadAny 现状 | CodexNovel API |
|------|-------------|----------------|
| 书的形态 | 本地文件（epub/pdf/…），`filePath` 必填 | 服务端 `novelId`，章流 `GET .../chapters/:n` |
| 进度 | `progress: 0–1` + EPUB `currentCfi` | `(userId, novelId)` → `chapterNumber` + `offsetRatio`，LWW |
| 目录 | foliate 从文件 spine/TOC 解析 | 分页 TOC + `toc/delta?since=` |
| 同步 | WebDAV/S3/LAN 同步 **整库文件** | 书架/进度/书签 REST；无整本文件 |
| 网络 | `IPlatformService.fetch` 给 AI/同步用 | 需 JWT + refresh + 限流处理 |
| 渲染 | foliate-js 读本地/blob epub | 纯文本/段落 JSON，需自建阅读面或合成文档 |

**结论：不能「整本塞进 EPUB 再走原阅读器」作为主路径**（两千章连载 + 频繁追更会炸）。  
采用 **在线书虚拟源 + 章节缓存 + 专用/轻量阅读路径**，进度字段与 API 对齐，本地书路径保持不动。

## 3. 推荐架构

```
┌─────────────────────────────────────────────────────────────┐
│  UI: Desktop (packages/app) + Mobile (packages/app-expo)    │
│  - 设置：服务器地址 / 登录                                    │
│  - 在线书库 / 书架页                                          │
│  - 在线阅读器（章切换、进度条、追更角标）                        │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│  @readany/core  新增模块 packages/core/src/codexnovel/        │
│  - client.ts      HTTP + JWT refresh + 429 Retry-After        │
│  - auth.ts        login/register/logout/token store           │
│  - books.ts       books / toc / chapter                       │
│  - shelf.ts       shelf / updates                             │
│  - progress.ts    get/put/batch + offline queue               │
│  - cache.ts       章节 contentHash / ETag 磁盘缓存             │
│  - mapping.ts     novelId ↔ local bookId；进度 CFI 合成        │
│  - types.ts       与 api-v1 对齐的 DTO                        │
└───────────────────────────┬─────────────────────────────────┘
                            │
              IPlatformService.fetch / kv* / fs
                            │
┌───────────────────────────▼─────────────────────────────────┐
│  codexnovel  /api/v1                                         │
└─────────────────────────────────────────────────────────────┘
```

### 3.1 本地书记录怎么存

在线书进入本地库时：

- `id`：稳定本地 ID，建议 `cn-{novelId}`（避免与 UUID 本地书冲突）
- `format`：扩展为 `"online"`（或暂用 `txt` + 元数据标记，**优先正式 format**）
- `filePath`：占位，如 `codexnovel://{novelId}`（不指向真实文件）
- `meta`：title/author/coverUrl/description/`totalChapters` 来自 API
- `tags`：含 `codexnovel` 便于筛选
- 扩展字段（SQLite migration 或 sidecar 表 `codexnovel_books`）：
  - `remote_novel_id` INTEGER
  - `last_chapter_number` / `last_chapter_title`
  - `toc_sync_since` ISO 时间（给 delta）
  - `shelf_added` bool
  - `has_update` bool

**进度编码（兼容现有 `current_cfi` 列）：**

```
codexnovel:ch:{chapterNumber}:off:{offsetRatio}
```

- 阅读时解析该 CFI；上报时拆成 `chapterNumber` + `offsetRatio`
- `progress` 仍写 0–1：`chapterNumber / max(lastChapterNumber,1)`（或按已读章粗算），仅用于书架展示

### 3.2 章节缓存

路径约定（数据目录下）：

```
codexnovel/chapters/{novelId}/{chapterNumber}.json
```

内容：`{ contentHash, title, content, paragraphs, updatedAt }`  
请求带 `If-None-Match`；304 用缓存。清缓存不删进度（与 api-v1 约定一致）。

### 3.3 阅读器策略

**MVP（优先）：** 专用 OnlineReader 组件

- 桌面 `packages/app`、移动 `packages/app-expo` 各接一层 UI
- 渲染 `paragraphs` 为可滚动/分页文本（复用现有阅读主题：字号、行高、深浅色）
- 上一章/下一章走 `prev`/`next` + 预取 `next`
- **不**强制走 foliate-js（避免伪造整本 EPUB）

**后续可选：** 将当前章临时拼成微型 EPUB blob 喂 foliate（为高亮/CFI 工具链），本期不做。

### 3.4 鉴权与配置

设置项（settings / kv）：

| Key | 含义 |
|-----|------|
| `codexnovel.baseUrl` | 如 `https://example.com`（自动拼 `/api/v1`） |
| `codexnovel.accessToken` | JWT（内存 + secure/kv） |
| `codexnovel.refreshToken` | opaque |
| `codexnovel.user` | `{ id, username, displayName }` |
| `codexnovel.deviceName` | 设备名，progress 上报用 |
| `codexnovel.deviceId` | 设备订阅用 |

- 401 → 尝试 refresh → 失败则登出
- 429 → 读 `Retry-After`，队列退避
- 可选：仅 Access Token 只读书库（无书架写），MVP 以用户 JWT 为主

### 3.5 与 WebDAV 同步的边界

- 在线书 **正文缓存可不进 WebDAV**（或仅同步元数据/进度）
- 进度权威源：codexnovel 云端 LWW；本地先写再 batch
- 不把 `codexnovel://` 书当文件上传到 WebDAV

## 4. 非目标（本期不做）

- 真 FCM/APNs 推送（设备表可注册，通知用轮询 `/me/notices/updates`）
- 改写 AI/RAG/TTS 主流程（在线章可后接 TTS，不阻塞主路径）
- Legado 书源规则进 App
- 替换 codexnovel Web SSR
- 向上游 ReadAny 强推 GPL 分叉策略以外的品牌重做（可后续改名/包名）

## 5. 关键文件锚点（摸底结果）

| 区域 | 路径 | 对接关系 |
|------|------|----------|
| 共享逻辑 | `packages/core/src/` | **新模块 `codexnovel/` 落点** |
| 平台 fetch/kv | `packages/core/src/services/platform.ts` | 所有 HTTP 经此 |
| 本地书表 | `packages/core/src/db/book-queries.ts` + migrations | 扩展 format/元数据 |
| 书库 UI 桌面 | `packages/app/src/stores/library-store.ts` | 合并在线书架条目 |
| 打开书 桌面 | `packages/app/src/lib/library/open-book.ts` | `format==='online'` 分支 |
| 进度落库 桌面 | `packages/app/src/components/reader/ReaderView.tsx` | 在线阅读器镜像进度写回 |
| 移动书库/打开 | `packages/app-expo/src/stores/library-store.ts`、`lib/library/open-mobile-book.ts` | 同语义 |
| 设置 | `packages/core/src/stores/settings-store.ts` + 各端 settings 页 | 服务器/登录 UI |
| 更新检查 | `packages/core/src/update/update-checker.ts` | 可并存；强更另读 `/ops` |
| 服务端契约 | `D:\codexnovel\docs\api-v1.md` | 唯一 API 真相源 |

## 6. 进度模型映射

```
本地写：
  books.current_cfi = "codexnovel:ch:120:off:0.37"
  books.progress    ≈ 120 / lastChapterNumber
  books.updated_at  = now

上报 PUT /me/progress：
  { novelId, chapterNumber: 120, offsetRatio: 0.37,
    updatedAt: ISO, deviceName }

拉取后 LWW：
  若服务端 updatedAt 更新 → 覆盖本地 cfi/progress
  否则保留本地，batch 时 applied:false 出队
```

离线队列（与 api-v1 §进度 batch 约定一致）：

1. 本地先写  
2. 联网 `POST /me/progress/batch` ≤50  
3. applied true/false 均出队；仅网络/5xx 重试  
4. `NOT_FOUND` 丢弃或标脏  

## 7. 验收标准（整体）

- [ ] 可配置 baseUrl，登录/刷新/登出  
- [ ] 书库列表、加入书架、书架显示 `hasUpdate`  
- [ ] 打开在线书可读正文，切章，缓存 304 生效  
- [ ] 进度本地 + 云端 LWW；杀进程再开位置正确  
- [ ] 断网改进度，联网后 batch 同步  
- [ ] TOC delta 追更后目录与最新章可读  
- [ ] 本地 epub 导入/阅读/ WebDAV **回归无破坏**  
- [ ] 每阶段一次 git commit（`main`）
