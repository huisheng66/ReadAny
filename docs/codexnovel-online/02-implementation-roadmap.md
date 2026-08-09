# CodexNovel 在线书库对接 — 实施路线图

> 配合 `01-architecture.md`。  
> 约定：**每完成一期 → 自测 → 在 ReadAny `main` 提交一次**。  
> 服务端已在 codexnovel `app` 就绪，客户端只读其 `/api/v1`。

## 总览

| 期 | 主题 | 交付物 | 提交信息建议 |
|----|------|--------|--------------|
| R0 | 脚手架与 API 客户端 | core 模块 + 单测 + 文档索引 | `feat(codexnovel): R0 API 客户端与鉴权骨架` |
| R1 | 书库与书架 | 浏览/加架/本地在线书条目 | `feat(codexnovel): R1 在线书库与书架` |
| R2 | 在线阅读 + 进度 | OnlineReader + 缓存 + LWW/batch | `feat(codexnovel): R2 章节阅读与进度同步` |
| R3 | 无痛追更 | TOC delta、shelf updates、预取 | `feat(codexnovel): R3 TOC 增量与追更` |
| R4 | 书签/运营/收尾 | bookmarks、/ops、设备通知轮询、回归 | `feat(codexnovel): R4 书签运营与收尾` |

平台优先级：**先 Desktop（`packages/app`）跑通闭环，再补 Expo（`packages/app-expo`）**。  
R2 起桌面必须可用；移动端可在 R2 末或 R3 并行补齐（同一期提交或拆 commit 注明）。

---

## R0 — API 客户端与鉴权骨架

### 范围

- 新建 `packages/core/src/codexnovel/`
  - `types.ts`：对齐 api-v1 的 Book/Chapter/Shelf/Progress/Error
  - `client.ts`：`request(path, { method, body, auth, etag })`
    - Base：`{baseUrl}/api/v1`
    - Header：`Authorization: Bearer`、可选 `X-Access-Token`
    - 解析统一 `error.code`；401 触发 refresh 一次
    - 429 抛出带 `retryAfterSec` 的错误
  - `auth.ts`：register / login / refresh / logout / me
  - `token-store.ts`：经 `IPlatformService.kv*` 读写 token（key 前缀 `codexnovel.`）
  - `config.ts`：baseUrl 规范化（去尾斜杠，禁止裸 path）
  - `index.ts` 导出
- `packages/core` exports 增加 `./codexnovel` 与 `./codexnovel/*`
- Vitest：client URL 拼接、错误映射、token refresh 分支（mock fetch）
- 可选脚本：`packages/core` 或仓库 `scripts/smoke-codexnovel.mjs` 打本地 `:3008/api/v1/health`（环境变量 `CODEXNOVEL_BASE_URL`）

### 不做

- UI、书架、阅读器

### 验收

- [ ] `pnpm test:core` 相关用例通过  
- [ ] 对运行中的 codexnovel：`GET /health`、login → `/me` 手工或 smoke 成功  
- [ ] 无 UI 回归

### 提交

`feat(codexnovel): R0 API 客户端与鉴权骨架`

---

## R1 — 在线书库与书架

### 范围

- core：
  - `books.ts`：`listBooks` / `getBook` / `getToc`（分页）
  - `shelf.ts`：list / add / remove
  - `mapping.ts`：`cn-{novelId}` ↔ novelId；API item → 本地 `Book` 草案
- DB：
  - migration：`codexnovel_books` 旁路表 **或** books 上可空列  
    推荐旁路表，少动现有 WebDAV 同步字段语义
  - 查询：列出已加架在线书，合并进 library store
- Desktop UI：
  - 设置页：「在线书库」区块 — baseUrl、登录/登出、当前用户
  - 新页面或 Tab：「书城 / 书架（在线）」— 搜索、分页、加入书架
  - 本地书架展示在线书封面/标题；`hasUpdate` 角标字段预留（R3 填真）
- `open-book`：若 `format==='online'`，暂提示「将在阅读器阶段打开」或跳到占位页（R2 替换）

### 不做

- 正文章节阅读、进度上报

### 验收

- [ ] 登录后可见服务端书列表  
- [ ] 加入/移出书架反映在 API 与本地  
- [ ] 本地 epub 书库行为不变  

### 提交

`feat(codexnovel): R1 在线书库与书架`

---

## R2 — 章节阅读与进度同步

### 范围

- core：
  - `chapter.ts`：`getChapter` + `If-None-Match`
  - `cache.ts`：按 novelId/chapterNumber 读写缓存
  - `progress.ts`：get / put / batch；内存+kv 离线队列
  - `cfi.ts`：编解码 `codexnovel:ch:N:off:R`
- Desktop OnlineReader：
  - 打开在线书：拉进度（云端 vs 本地 LWW）→ 打开章 → 渲染 paragraphs
  - 节流保存进度（对齐 ReaderView ~5s）+ 退出 flush
  - 联网 put；失败入队；启动/回前台 flush batch
- 预取：进入章后后台拉 `next`（不阻塞）
- 打开路径：`open-book.ts` 识别 online → OnlineReader tab

### 移动端

- 最低：Expo 可打开同一 OnlineReader 屏幕并读写进度（可与桌面同 commit 或紧随）

### 不做

- TOC delta、shelf updates 轮询（R3）
- 书签云同步（R4）

### 验收

- [ ] 可读多章，切章正确  
- [ ] 缓存命中 304 / 本地文件  
- [ ] 双端或重启后进度 LWW 正确  
- [ ] 断网改进度，联网 batch 后服务端一致  
- [ ] 限流 429 不崩溃（可 toast + 重试）  

### 提交

`feat(codexnovel): R2 章节阅读与进度同步`

---

## R3 — 无痛追更

### 范围

- core：
  - `tocDelta` 合并本地 TOC 缓存
  - `shelfUpdates(since)`；持久化 `lastShelfCheckAt`
- UI：
  - 书架 `hasUpdate` / `newChapterCount` 角标
  - 阅读器内「已更新到第 N 章」提示；目录刷新
  - 前台/定时轻量轮询（退避，避免打爆限流）
- 章缓存：delta 中 `contentHash` 变化则失效该章缓存

### 验收

- [ ] 服务端加章后，客户端书架出更新  
- [ ] TOC 增量合并无需全量重拉  
- [ ] 修文后正文刷新（hash 变）  

### 提交

`feat(codexnovel): R3 TOC 增量与追更`

---

## R4 — 书签、运营与收尾

### 范围

- 书签：`/me/bookmarks` CRUD，与阅读器「添加书签」挂钩（在线书用 chapterNumber+offsetRatio）
- `/ops`：启动检查 announcement + minClientVersion/forceUpdate（可与 GitHub update 并存）
- `/me/devices` 注册 + `/me/notices/updates` 轮询（无真推送）
- i18n 中英文案
- 文档：本目录补 `03-client-api-notes.md`（实现偏差与已知限制）
- 回归：本地书导入、WebDAV 同步配置页、桌面打开 epub

### 验收

- [ ] 书签增删改查与服务端一致  
- [ ] 强更/公告策略可展示  
- [ ] 本地书路径 smoke 通过  
- [ ] README 或 docs 链到本计划  

### 提交

`feat(codexnovel): R4 书签运营与收尾`

---

## 工程约定

1. **分支**：ReadAny 在 `main` 直接阶段提交（与原计划一致）；不改上游默认行为以外的大重构。  
2. **依赖方向**：仅 `core` 依赖平台接口；UI 不直接拼 fetch URL。  
3. **密钥**：token 不进 git；日志脱敏。  
4. **测试**：R0 起 core 单测；R2 起 progress/cfi/queue 单测优先。  
5. **联调**：本机 codexnovel `app` 分支 + `.env`；CORS 若桌面 Tauri 无浏览器 CORS 问题；Expo 需服务端允许设备访问（局域网 IP）。  
6. **提交节奏**：一期结束再 commit，不把半截 UI 和 API 混在未完成期。  
7. **不 push** 除非用户明确要求。

## 风险与缓解

| 风险 | 缓解 |
|------|------|
| 在线书硬塞 foliate | 专用 OnlineReader，避免假 EPUB |
| WebDAV 把占位路径当文件同步 | online 书 `syncStatus` 特殊处理 / 文件同步跳过 |
| format 扩展破坏 switch | 全库检索 `format ===` 并加 default 分支 |
| 章节限流 | 预取节流、缓存、429 退避 |
| 进度 CFI 混用 | 严格前缀 `codexnovel:`，本地 epub 永不写此前缀 |

## 启用 Goal 后的执行顺序

```
R0 实现 → 测 → commit
R1 实现 → 测 → commit
R2 实现 → 测 → commit
R3 实现 → 测 → commit
R4 实现 → 测 → commit
```

Goal 验收 = 上表五期提交齐 + 整体验收勾选完成。  
**不包含**：上架商店、品牌换皮、真推送、AI 深度索引在线书全文（可后续）。
