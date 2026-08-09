# CodexNovel × ReadAny 在线对接

将 [codexnovel](https://github.com/huisheng66) 读者 API（`/api/v1`）接入 ReadAny fork，实现官方 App 向的在线书库、章节流阅读与云进度。

| 文档 | 说明 |
|------|------|
| [01-architecture.md](./01-architecture.md) | 目标、差异、模块边界、进度/缓存模型 |
| [02-implementation-roadmap.md](./02-implementation-roadmap.md) | R0–R4 分期、验收、提交约定 |

## 仓库与分支

| 侧 | 路径 | 分支 |
|----|------|------|
| 客户端 | `D:\ReadAny`（`huisheng66/ReadAny`） | `main` |
| 服务端 | `D:\codexnovel` | `app`（API 已完成） |
| 契约 | `D:\codexnovel\docs\api-v1.md` | — |

## 本地状态

1. **依赖**：`pnpm install` 已完成
2. **摸底**：见 architecture §5 文件锚点
3. **计划**：本目录 R0–R4
4. **实现**：
   - [x] R0 — `packages/core/src/codexnovel/`（client / auth / token-store）
   - [x] R1 — 书库与书架 + 桌面设置/书城
   - [ ] R2 — 阅读与进度
   - [ ] R3 — 追更
   - [ ] R4 — 书签 / ops / 收尾

## 开发命令

```bash
# core 单测（含 codexnovel）
pnpm test:core

# 可选：对运行中的 codexnovel 做 health/login smoke
CODEXNOVEL_BASE_URL=http://127.0.0.1:3008 node scripts/smoke-codexnovel.mjs
```

```ts
import {
  configureCodexNovelBaseUrl,
  loginCodexNovel,
  getCodexNovelHealth,
  codexNovelRequest,
} from "@readany/core/codexnovel";
```
