# 官网部署与分支流程

`landing/` 是 Next.js 静态导出站点，由 Cloudflare Workers Static Assets 托管。Worker 名称为 `rssany`，`landing/wrangler.jsonc` 将 `rssany.com/*` 绑定到该 Worker。本文只描述官网；npm 包发布使用独立的 `.github/workflows/npm-publish.yml`，不随 `main` 或 `dev` 推送触发。

## 分支约定

| GitHub 分支 | 用途 | Cloudflare Workers Builds 行为 |
| --- | --- | --- |
| `main` | 生产基线 | 构建并执行 `npx wrangler deploy`，更新 `rssany.com` |
| `dev` | 日常开发与集成 | 构建并执行 `npx wrangler versions upload`，只上传非生产版本，不改变线上路由当前使用的版本 |

远端长期只保留这两个分支。日常在本地 `dev` 工作，验证后通过 PR 将 `dev` 合入 `main`。不要将 `main` 的生产部署视作 `dev` 推送的必然结果；只有 `main` 的成功部署才会更新生产站点。当前仓库未配置强制分支保护，PR 是协作约定而非平台强制规则。

## Cloudflare 配置

Cloudflare Dashboard → Workers & Pages → `rssany` → Settings → Builds 中，Git 仓库连接为 `joohw/rssany`，配置如下：

| 项目 | 值 |
| --- | --- |
| Root directory | `/landing` |
| Build command | `npm run build` |
| Production branch | `main` |
| Production deploy command | `npx wrangler deploy` |
| Non-production branch builds | Enabled |
| Non-production deploy command | `npx wrangler versions upload` |

`landing/wrangler.jsonc` 声明静态产物目录 `./out`、404 处理和 `rssany.com/*` Workers Route。站点的 Cloudflare 代理 DNS 记录仍指向旧源站，但**不会在 Worker 故障时自动回退**；只有手动移除或调整该 Route 后，请求才可能回到旧源站。

当前配置没有启用 Worker preview URL。`dev` 上传的版本可在 Cloudflare 的 Builds / Versions 中检查，但不要假设会有可公开访问的固定 `dev` 域名。若要开放预览，需显式配置 `preview_urls`，并考虑未发布内容的访问控制；预览 URL 默认是公开的。

## 日常操作

从远端同步并在 `dev` 开发：

```bash
git switch dev
git pull --ff-only origin dev
cd landing
npm ci
npm run lint
npm run build
```

`npm run build` 应在 `landing/out/` 生成静态文件。提交后推送 `dev`，在 Cloudflare Builds 确认对应提交的非生产构建成功。准备上线时，将 `dev` 合入 `main` 并推送；在 Builds 确认 `main` 的生产构建与部署成功，再核对 `https://rssany.com/zh-CN`、`/en`、`/robots.txt`、`/sitemap.xml` 和不存在的页面（应返回 404）。根路径 `/` 应重定向到 `/zh-CN`。

`landing/package.json` 的 `npm run deploy` 会直接执行生产 `wrangler deploy`，**不会因为本地处于 `dev` 就变成预览部署**。常规发布应走 `main` 的 Cloudflare Builds；仅在明确需要手动生产发布时使用该命令。

## 故障与回退

先看对应提交的 Cloudflare Build / Deploy 日志。若新版本已上线且需恢复，可在 Cloudflare Worker 的 Deployments 中回滚到已知正常版本，或在 `main` 上 revert 问题提交并等待自动部署。回滚 Worker 版本不会删除 `rssany.com/*` Route；若计划临时切回旧源站，必须单独处理 Route，并核对旧源站可用。

Cloudflare 官方参考：[Builds 配置](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)、[分支构建](https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/)、[预览 URL](https://developers.cloudflare.com/workers/versions-and-deployments/preview-urls/)。
