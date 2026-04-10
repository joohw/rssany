# RSSAny - 把任何信息变成RSS订阅


> 按信源抓取网页 / RSS / 邮件等，解析、补全文、打标签与翻译后**入库**，再按需生成 **RSS / Atom / JSON Feed** 与 JSON API。

**RSSAny** 是一套自托管的订阅管线：列表 URL → **抓取与解析**（规则 / LLM）→ **正文提取**（自定义 / Readability / LLM）→ **upsert 去重** → 固定 **pipeline**（打标签、翻译等）→ 对外提供 `**/rss`** 等输出。

## 界面预览

![RSSAny Web 界面截图](images/ScreenShot_2026-04-10_153307_558.png)

---

## 功能概览

- **统一订阅**：在 `.rssany/sources.json` 中配置网站列表、标准 RSS、IMAP 邮件等，由调度器按 `refresh` 策略拉取。
- **可插拔信源**：`app/plugins/builtin/` 与 `.rssany/plugins/` 中的 **Site** 插件（`.rssany.js` / `.rssany.ts`），自定义列表解析与详情规则。
- **正文与解析**：在信源 `fetchItems`（及需要的 `ctx.extractItem` 等）内完成；入库后跑 pipeline。
- **固定 pipeline**：`app/pipeline/` 中打标签、翻译等，由 `.rssany/config.json` 的 `pipeline.steps` 开关（**不是**用户目录下的 pipeline 插件）。
- **LLM 辅助**：解析、提取、标签、翻译等可按配置走 OpenAI 兼容接口。
- **站点登录**：需登录的站点通过 Puppeteer 管理 Cookie（与产品用户账号无关）。
- **可选远端投递**：若 `config.json` 中 `**deliver.url`** 非空，在写库与 pipeline 完成后将条目以 `**{ sourceRef, items }**` JSON **POST** 到该 URL（由 `app/deliver/post.ts` 发送）；留空则仅本地消费。
- **MCP**：条目检索等能力以 MCP 暴露，供 Cursor、Claude 等使用。
- **Web 界面**：SvelteKit 构建产物由后端托管；**Feeds** 等需 **邮箱校验**；`**/admin`** 需 `**users.role === 'admin'**`（可从 `**/me**` 进入）。

---

## 技术栈（摘要）


| 层级  | 说明                                                           |
| --- | ------------------------------------------------------------ |
| 运行时 | Node.js **20–23**（见 `package.json` `engines`）                |
| 后端  | Hono、`tsx` 开发入口                                              |
| 数据  | **SQLite**（`better-sqlite3`），默认 **`~/.rssany/data/rssany.db`**（Windows：`%USERPROFILE%\.rssany\data\rssany.db`） |
| 前端  | `webui/`（SvelteKit + Vite，构建输出由根服务托管）                        |


原生模块 `**better-sqlite3**` 安装时会编译；若遇绑定缺失，请确认未禁用构建（仓库 `pnpm-workspace.yaml` 中已允许其 `allowBuilds`）。

---

## 快速开始

### 环境要求

- Node.js **20.x–23.x**（与 `package.json` 的 `engines` 字段一致）
- **pnpm**

### 安装依赖

```bash
pnpm install
pnpm run webui:install
```

### 配置

1. 复制环境变量示例并按需填写（JWT、OAuth、SMTP、LLM 等）：
  ```bash
   cp .env.example .env
  ```
2. 信源与全局配置：首次启动会在 **`~/.rssany/`**（Windows：`%USERPROFILE%\.rssany\`）下自动从包内 **`init/`** 目录中的默认数据复制生成 `sources.json`、`config.json`（若已存在则不会覆盖）。也可手动复制仓库里的 `init/sources.json`、`init/config.json`。
3. （可选）LLM：在 `.env` 中设置 `OPENAI_API_KEY`、`OPENAI_BASE_URL`、`OPENAI_MODEL` 等。

### 运行

**开发**（后端根路径托管 `webui` 构建产物，改前端需重新构建或 watch）：

```bash
# 推荐：API + 前端 watch（修改 Svelte 后自动写入构建目录，刷新浏览器即可）
pnpm run dev:all

# 或分步：先打一次前端再起后端
pnpm run webui:build
pnpm dev
```

默认监听 `**http://127.0.0.1:18473/**`（端口见 `.env.example` 中 `PORT`，避免与常见开发端口冲突）。

**重置本地数据**（结束占用 `PORT` 的监听进程，并删除 **`~/.rssany/`**，或 `RSSANY_USER_DIR` 所设目录）：

```bash
pnpm reset
```

**仅调试 WebUI 热更新**（可选）：`cd webui && pnpm dev`（Vite 代理到本机后端，见 `webui/vite.config.ts`）。

**生产**：

```bash
pnpm run webui:build && pnpm start
```

### npm 全局安装（或 `npx`）

发布包时 `prepublishOnly` 会执行 `build:all`（后端 `vite build` + `webui:build`）。安装后：

```bash
npm install -g rssany
rssany
```

重置数据（结束 `PORT` 监听进程并删除用户目录）：**`rssany reset`**（与仓库内 **`pnpm reset`** 相同逻辑；可在含 `.env` 的目录下执行以读取 `PORT` / `RSSANY_USER_DIR`）。

用户数据在 **`~/.rssany/`**（Windows：`%USERPROFILE%\.rssany`），与工作目录无关。可选环境变量 **`RSSANY_USER_DIR`** 可指定其它路径。等价于 `node node_modules/rssany/dist/index.js`；CLI 名称为 `rssany`。内置 `app/plugins/builtin/`、`statics/`、`webui/build` 随包安装路径解析。

---

## 数据流（简图）

```
sources.json / Site 插件
  → 调度器触发 fetchItems
  → upsertItems
  → pipeline（每条一次）
  → [可选] deliver.url POST（出站，非入站 API）
```

消费侧：**RSS/XML**、`**/api/*`**、**MCP**、Web UI。

---

## 常用 HTTP 能力

### RSS 输出

- **按条件从库中生成**：支持 `search`、`tags`、`lng`、`limit` 等查询参数；可用 `subscribed=1` 限定为 `sources.json` 中出现的 ref。
- **按 URL 即时抓取**：`GET /rss/https://example.com/...`（具体行为以路由实现为准）。

---

## 插件与配置

### 信源插件（Site）

放置于 `**app/plugins/builtin/**` 或 `**.rssany/plugins/**`（扁平），用户插件可与内置插件同 `id` 覆盖。最小约定包括 `id`、`listUrlPattern` 等（详见 `app/scraper/sources/web/site.ts`）。

### Pipeline（固定代码）

`**app/pipeline/**`，通过 `**.rssany/config.json**` 配置步骤，例如：

```json
{
  "pipeline": {
    "steps": [
      { "id": "tagger", "enabled": true },
      { "id": "translator", "enabled": false }
    ]
  },
  "deliver": {
    "url": ""
  }
}
```

`deliver.url` 非空时会对处理完成的条目向该 URL 发起出站 POST；留空则不投递。

### `sources.json` 片段示例

```json
{
  "sources": [
    { "ref": "https://example.com/feed.xml", "label": "Example", "refresh": "1h" }
  ]
}
```

合法 `refresh` 取值包括：`10min`、`30min`、`1h`、`6h`、`12h`、`1day`（默认）、`3day`、`7day`。

---

## 仓库目录（摘要）

```
├── app/                 # 后端：路由、feeder、scraper、pipeline、mcp、db、auth…
│   └── plugins/builtin/ # 内置信源 *.rssany.js
└── webui/               # SvelteKit 前端

~/.rssany/               # 运行时用户数据（首次启动创建；或 RSSANY_USER_DIR）
    ├── sources.json
    ├── config.json
    ├── tags.json
    ├── data/rssany.db   # SQLite 主库
    ├── cache/
    └── plugins/         # 用户插件覆盖内置
```

更细的模块说明见 **[AGENTS.md](./AGENTS.md)**（与代码迭代同步，若有出入以代码为准）。

---

## 许可证

MIT