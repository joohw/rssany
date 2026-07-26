# WebUI React 迁移

## 决策

WebUI 从 SvelteKit 静态 SPA 迁移至 React + Vite + shadcn/ui。后端 Hono 路由与 `/api/*` 协议保持不变。

迁移完成后：

- 旧 SvelteKit 实现已删除。
- 当前实现位于 `app/webui-react/`，Hono 默认托管其 Vite 构建。
- 不使用 TanStack Query。现阶段通过 `src/api/client.ts` 集中请求、页面级状态和小型 hooks 管理交互；当出现跨页缓存失效或复杂无限列表需求时再评估引入。

## 目标技术栈

```
React + TypeScript + Vite
React Router
shadcn/ui + Radix UI
Tailwind CSS 4
Lucide React
```

## 已迁移页面

1. 信源列表、信源编辑与条目面板。
2. 日志、插件管理、插件编辑器和 Skill。
3. update、deliver、llm、proxy、pipeline、tags、parse 设置页。
4. 初始化路由为 `/init`，不再提供 `/initialize` 前端路由。

前端不再提供 Parse 调试页面；内部抓取调试接口仍保留 `/admin/parse/*`。

## 不变项

- URL 路径。
- Hono API 契约。
- `.rssany/config.json` 数据格式。
- 静态部署与单端口访问模型。
