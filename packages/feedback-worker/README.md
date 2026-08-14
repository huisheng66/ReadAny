# ReadAny Feedback Worker

Cloudflare Worker for creating GitHub Issues from in-app feedback.

当前目标仓库（`wrangler.toml`）：

- `GITHUB_OWNER = huisheng66`
- `GITHUB_REPO = ReadAny`

## Setup（本机一次）

1. 登录 Cloudflare（会打开浏览器）：

```bash
pnpm dlx wrangler@4 login
```

2. 创建 GitHub Token（fine-grained，对该仓库 Issues 读写；Gist 写权限用于日志）。
3. 写入 Worker secret：

```bash
pnpm --filter @readany/feedback-worker secret:token
```

4. KV 限流命名空间（若 `wrangler.toml` 里 id 无效则重建）：

```bash
pnpm dlx wrangler@4 kv namespace create FEEDBACK_RATE_LIMIT
```

把返回的 id 写进 `wrangler.toml` 的 `[[kv_namespaces]]`。

5. 部署：

```bash
pnpm --filter @readany/feedback-worker deploy
```

## Client Configuration

部署成功后把 Worker URL 写入本地 env（已 gitignore）：

Desktop — `packages/app/.env.local`：

```bash
VITE_FEEDBACK_WORKER_URL=https://readany-feedback-worker.<account>.workers.dev
```

Expo — `packages/app-expo/.env.local`：

```bash
EXPO_PUBLIC_FEEDBACK_WORKER_URL=https://readany-feedback-worker.<account>.workers.dev
```

也可参考同目录 `.env.example`。未配置时应用内反馈走本地 mock，不会提交到上游。

## Rate Limits

The app still has local daily limits, but production should also use the Worker
KV limit. Defaults:

- `RATE_LIMIT_SUBMISSIONS_PER_DAY=20`
- `RATE_LIMIT_STATUS_PER_HOUR=120`
