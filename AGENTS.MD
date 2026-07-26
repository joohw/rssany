# RssAny 项目架构说明

面向贡献者与 AI 助手的架构速览；**实现细节以代码为准**。

## 产品定位

RssAny 是**自托管的 RSS / 订阅管线**：把**网页列表、RSS/Atom、邮件等信源**通过定时抓取与插件解析，变成**统一条目库**，再输出 **RSS XML**、JSON API，并可选 **MCP** 消费。核心是 **「爬取 → 入库去重 → 转可订阅流」**，不是研究报告或独立「研究型 Agent」产品。

---

## 文档索引

- **[插件开发与管理](docs/plugins.md)**：插件协议、目录约定、配置关系、管理 API 与 MCP 工具。

`AGENTS.MD` 只保留架构和行为边界；具体操作与协议文档统一放在 `docs/`。

---

## 运行模型（持久化）

- **RSS XML**：一般不单独长期落盘成静态文件；按请求或抓取流程**按需生成**。
- **条目**：写入 SQLite 表 **`items`**，供 `/api/feed`、`/rss` 等查询与去重。
- **投递**：若 **`.rssany/config.json`** 中 **`deliver.url`** 非空，在写库与 pipeline 完成后**出站** `POST` 到该 URL（JSON：`{ sourceRef, items }`，见 `app/deliver/post.ts`）；**无单独投递开关**，有 URL 即会投递（具体与后台「投递」页逻辑一致）。
- **日志**：运行日志等落库；**抓取缓存**在 **`.rssany/cache/`**。
- **无入站 Gateway**：不提供接收外部 HTTP 推送条目的 API；条目以**本机调度 + 爬虫**为主。

| 区域 | 说明 |
|------|------|
| **Feeds（前端）** | 访客侧以 WebUI 路由与中间件为准；部分区域需 **邮箱校验**。 |
| **Admin（`/admin`）** | 管理 API 经 **`requireAdmin()`**；当前本地运行中间件为直通模式，不做令牌校验，不应直接暴露到不可信网络。 |

---

## 技术内核

- **后端**：Hono（`app/router/`）
- **存储**：**SQLite**（Node.js 内置 `node:sqlite`），默认 **`~/.rssany/data/rssany.db`**（或 **`RSSANY_USER_DIR`**）
- **管线**：**feeder**（生成 RSS / 入库）+ **scraper**（信源、auth、调度）+ **固定 pipeline**（`app/pipeline/`，非用户插件目录）
- **LLM**（可选）：`app/core/llm.ts` 等，用于解析、提取、pipeline 中的标签 / 翻译等

---

## 仓库目录（与代码一致）

```
项目根
├── app/
│   ├── router/          # HTTP：rss、api、auth、mcp、admin 调试路由等
│   ├── core/            # 缓存、cacher、事件、日志、LLM 封装
│   ├── db/              # SQLite：条目、用户、日志、标签相关查询
│   ├── feeder/          # 拉取条目、upsert、生成 RSS XML
│   ├── pipeline/        # 固定链：tagger、translator 等
│   ├── deliver/         # 出站投递 POST
│   ├── mcp/             # MCP 工具
│   ├── scraper/         # sources、auth、subscription、scheduler
│   ├── auth/            # JWT、requireAuth / requireAdmin
│   ├── config/          # 路径、品牌、deliver 读取等
│   └── scheduler/       # 通用定时任务（与 scraper/scheduler 等协作）
├── app/plugins/builtin/  # 默认插件种子（随包发布，首次初始化复制到用户目录）
├── app/init/             # 首次初始化默认数据（config.json → 复制到 ~/.rssany/）
├── webui/               # SvelteKit 静态前端，构建产物由后端托管
└── statics/             # 其它静态资源（若有）

~/.rssany/（用户主目录下，首次启动创建；可选 RSSANY_USER_DIR）
├── config.json          # initialized、sources、sites、tags、pipeline、deliver、llm 等统一配置
├── data/rssany.db       # SQLite
├── cache/               # fetched、extracted、domains、browser_data 等
└── plugins/             # 唯一运行时插件目录 *.rssany.{js,ts}（扁平，默认插件也会复制到这里）
```

**对应关系**：**core** → `app/core/`；**feeder** → `app/feeder/`；**scraper** → `app/scraper/`；**db** → `app/db/`。

---

## 架构模块（摘要）

### core

缓存路径、事件（如 `feed:updated`）、日志落库、LLM 配置读取。

### feeder

典型路径：`getSource` → `fetchItems`（信源内完成列表与正文等）→ `upsertItems` → 对每条 **pipeline** → `updateItemContent` → `buildRssXml`（或供 API 使用条目列表）。支持按 **`lng`** 输出译文字段。

### pipeline（固定链，非插件）

- **位置**：`app/pipeline/`
- **配置**：`.rssany/config.json` 的 `pipeline.steps`，如 `[{ id, enabled }]`
- **时机**：`upsertItems` 之后；若配置了 `deliver.url`，在条目 pipeline 完成后再出站投递

### scraper

- **sources**：`getSource`；web / api / email 等
- **auth**：站点 Puppeteer 登录、`AuthRequiredError`
- **subscription**：`.rssany/config.json` 的 `sources`
- **scheduler**：信源定时抓取（`app/scraper/scheduler/` 等）

### db

`app/db/`：SQLite 上条目 CRUD、日志、`query_items` 等；`getItemById` 供 MCP / API。

### HTTP 层（`app/router`）

| 路径 | 作用 |
|------|------|
| `/rss/*` | RSS XML |
| `/api/*` | feed、items、sources、plugins、logs、tags、tasks… |
| `/api/auth/*` | 产品用户：注册 / 登录 / OAuth / JWT、`/me` 等 |
| `/admin/parse/*`、`/admin/extractor/*` | Parse / 正文提取调试（**admin**） |
| `/auth/*` | **站点** Puppeteer 登录（与 `/api/auth` 不同） |
| `/mcp` | MCP 工具 |

支持 **`lng`** 的路由按需返回译文（如部分 `/rss`、`/api`）。

---

## 数据流程

**1. 抓取与入库**

```
URL → getSource() → preCheckAuth() → fetchItems()
  → upsertItems()
  → pipeline（每条一次）→ updateItemContent() → 更新缓存
```

**2. 站点登录（插件站点）**

```
cache/domains/{domain}.json 有效？
  否 → ensureAuth() → 有头浏览器登录 → 写回 cookies → 后续请求携带
```

**3. 插件初始化与加载**

```
首次 initUserDir()
  → app/plugins/builtin/*.rssany.{js,ts} 复制到 .rssany/plugins/
  → 写入 .builtin-plugins-initialized.json（后续不覆盖、不补回删除项）
运行时只扫描 .rssany/plugins/*.rssany.{js,ts}
  → registeredSources
  → 开发模式监听用户插件目录并重载
```

---

## 插件体系（摘要）

插件的完整协议、示例、目录约定、配置关系、管理 API 与 MCP 工具见 **[docs/plugins.md](docs/plugins.md)**。

- `app/plugins/builtin/` 仅是首次初始化种子；运行时只加载 `.rssany/plugins/`。
- 默认插件首次复制到用户目录后与普通用户插件一致，可以通过 API / MCP 直接读取、修改或删除。
- 初始化标记存在时，后续启动和升级不会覆盖用户修改，也不会补回已删除插件。
- `app/pipeline/` 是固定处理链，不属于用户插件体系。

---

## 关键特性（速览）

- 用户插件与 `.rssany/` 数据与主仓库分离，升级不覆盖用户配置
- 解析 / 提取：**自定义 → LLM（若配置）→ 兜底**
- 条目按 guid 等去重；缓存窗口见插件与 `sources` 的 `refresh`
- **代理**：见上表

---

## 开发原则

当前按开发阶段迭代：**不做无意义 fallback**；**不做数据迁移脚本**（除非单独需求）。新代码避免背负已删除模块（如旧 Gateway、旧 research-only 路由）的命名与假设。

### npm 发布

- npm 包统一通过 GitHub Actions 的 `.github/workflows/npm-publish.yml` 发布，不直接依赖开发机执行 `npm publish` 或本机 npm 登录状态。
- 发布前更新 `package.json` 与 `package-lock.json` 的版本，运行测试、完整构建及 `npm pack --dry-run`，确认生产 WebUI 等必要产物已包含在 tarball 中。
- 将待发布代码提交并推送到 GitHub 后，再通过版本标签或 `workflow_dispatch` 触发发布；完成后核验 workflow 结果、npm 版本与 `latest` 标签。
