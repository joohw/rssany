# RssAny 项目架构说明

面向 AI 与贡献者的架构速览；实现细节以代码为准。

## 产品定位

RssAny **对外**类似 Alpha Signal：**每天用约几分钟**，把 **AI 领域信息差**（论文、产品、人物、动向等）压成可读信息流。多源抓取与频道编排是 **后台能力**，用于支撑这条 curated 体验，而不是「堆订阅源」本身。

| 区域 | 说明 |
|------|------|
| **Feeds** | 访客需 **邮箱校验** 后进入（留资 / 订阅）；具体以 WebUI 路由与中间件为准。 |
| **Admin（`/admin`）** | 需 **已登录** 且数据库 **`users.role === 'admin'`**；对应 API 经 **`requireAdmin()`** 校验。管理员可在 **`/me`** 进入后台入口。 |

---

## 技术内核

通用 **RSS / Atom / JSON Feed** 生成与入库：网页 → 可订阅源，条目进 **Supabase（PostgreSQL）**，可供 OpenWebUI、MCP 等消费；模块化、可插拔解析与提取。

### 核心能力（摘要）

- **RSS 生成**：列表 URL → 抓取 → 解析 → RSS XML  
- **解析**：自定义 Parser → LLM → 通用兜底  
- **正文**：自定义 Extractor、Readability、LLM  
- **站点登录**：Puppeteer 管理 cookies（与产品账户无关）  
- **插件**：内置 `plugins/` + 用户 `.rssany/plugins/`  
- **缓存**：多级目录与 key 策略  
- **数据**：条目、日志、全文检索等  
- **频道**：`channels.json` 等编排多路信源，支撑日报式生产  

---

## 仓库目录（与代码一致）

```
项目根（版本库）
├── app/                      # 后端：Hono、业务与任务
│   ├── router/               # HTTP 路由（rss、api、mcp、auth、userAuth、admin…）
│   ├── core/                 # cacher、channel、events、logger
│   ├── db/                   # Supabase、FeedItem、日志、用户等
│   ├── feeder/               # RSS 生成与入库主流程
│   ├── pipeline/             # 固定链：tagger、translator 等
│   ├── mcp/                  # MCP（Streamable HTTP / SSE）
│   ├── scraper/              # sources、enrich、auth、subscription、scheduler
│   ├── topics/               # Agent 日报生成 / 调度（与 scheduler 协作）
│   ├── agent/                # 对话 Agent、LLM 封装（如 parser/extractor 复用）
│   ├── auth/                 # JWT、中间件（requireAuth / requireAdmin）
│   ├── config/               # 路径、adminToken 等
│   ├── scheduler/            # 通用任务调度（分组、cron）
│   └── tasks/                # 异步任务状态（如信源拉取）
├── webui/                    # SvelteKit 前端（Feeds、/me、/admin、Agent…）
├── plugins/                  # 内置站点插件（*.rssany.{js,ts}）
└── statics/                  # 静态 HTML 等

用户数据（.rssany/，首次启动创建，一般不提交 Git）
├── sources.json              # 爬虫订阅
├── channels.json             # 频道编排
├── config.json               # enrich、pipeline、deliver 等
├── cache/                    # fetched / extracted / feeds / domains / browser_data
└── plugins/                  # 用户插件（可覆盖同名内置）
```

**四块对应**：**core** → `app/core/`；**feeder** → `app/feeder/`；**scraper** → `app/scraper/`；**db** → `app/db/`。

---

## 架构模块

### core

缓存目录策略、频道配置读写、事件总线（如 `feed:updated`）、日志落库。

### feeder

`URL → getSource → fetchItems → upsertItems → buildRssXml`；若有 **enrichItem** 则先入队，完成后 **pipeline（每条仅一次）** → `updateItemContent` 与缓存更新；无 enrich 则在入库后对每条跑 pipeline。支持 `lng` 译文。写库时可配合写文件模块落盘。

### pipeline（固定链，非插件）

- **位置**：`app/pipeline/`  
- **配置**：`.rssany/config.json` 的 `pipeline.steps`，形如 `[{ id, enabled }]`  
- **投递（deliver）**：独立开关；开启且配置 URL 时可将条目 **POST 到远端**，本机可不写库（纯转发节点）  
- **时机**：有 enrich 时在 enrich 完成之后；无 enrich 时在 `upsertItems` 之后  

### scraper

- **sources**：`getSource`；web / api / email  
- **enrich**：正文队列，并发与重试可配  
- **auth**：站点登录流、`AuthRequiredError`  
- **subscription**：`sources.json`  
- **scheduler**：信源定时抓取  

### db

`app/db/`：Supabase、条目 CRUD、日志、`query_items` 等；`getItemById` 供 MCP/API 详情。

### HTTP 层（`app/router`）

| 路径 | 作用 |
|------|------|
| `/rss/*` | 输出 RSS XML |
| `/api/*` | JSON API（feed、items、channels、sources、plugins、logs、…） |
| `/api/auth/*` | 产品用户：注册/登录/OAuth/JWT Cookie、`/me` 等 |
| `/admin/parse/*`、`/admin/extractor/*` | Parse / Enrich 调试 JSON（**admin**） |
| `/auth/*` | **站点** Puppeteer 登录（与 `/api/auth` 不同） |
| `/mcp` | MCP 工具（list_channels、get_feeds、feeds_search、…） |

支持 `lng` 的路由按译文输出（如 `/rss/*`、部分 `/api/*`）。

### Agent 日报调度（摘要）

- 调度分组：**`topics`**（生成 Markdown，默认本地 **5:00**）与 **`email`**（发邮件，默认 **6:00**）。  
- 可通过环境变量 **`DAILY_DIGEST_GENERATE_*`** / **`DAILY_DIGEST_SEND_*`** 调整时刻。  
- 详见 `app/topics/scheduler.ts`。

---

## 数据流程

**1. RSS 与入库**

```
URL → getSource() → preCheckAuth() → fetchItems()
  → upsertItems() → buildRssXml()
  → [后台] enrichItem() → pipeline（一次）→ updateItemContent() → 更新缓存
```

无 enrich：`upsertItems` 后对每条执行 pipeline → `updateItemContent`。

**2. 站点登录（插件站点）**

```
cache/domains/{domain}.json 有效？
  否 → ensureAuth() → 有头浏览器登录 → 写回 cookies → 后续请求携带
```

**3. 插件加载**

```
plugins/*.rssany.{js,ts}  +  .rssany/plugins/*.rssany.{js,ts}
  → 合并 registeredSources（用户覆盖同 id 内置）
  → 开发模式可监听重载
```

---

## 关键特性（速览）

- 插件扩展站点；用户插件不污染主仓库  
- `.rssany/` 与代码分离，升级不覆盖用户数据  
- 解析/提取：**自定义 → LLM → 兜底**  
- 条目按 id 去重；`pushed_at` 等用于推送追踪  
- 缓存窗口：`10min` … `7day`（见插件与订阅配置）  
- **代理**：`sources.json` 单源 > Feeder 传入 > `Site.proxy` > `HTTP_PROXY`  
- **Agent 页**：对话区无角色标签，靠背景区分样式（如用户区浅灰 `#f5f5f5`）  

---

## 插件体系

两阶段插件 + **固定 pipeline**（pipeline 不是插件）：

| 阶段 | 目录 | 职责 | 时机 |
|------|------|------|------|
| **sources** | `plugins/sources/`、`.rssany/plugins/sources/` | Site/Source，列表抓取与解析 | `fetchItems` |
| **enrich** | `plugins/enrich/`、`.rssany/plugins/enrich/` | 单条补全 `content` 等 | enrich 队列 |
| **pipeline** | `app/pipeline/` | 打标签、翻译等 | 每条一次（enrich 后或入库后） |

**分布式**：可在 pipeline 中 `fetch` POST 到其他节点网关，由远端入库或二次处理。

### 文件约定

- 后缀：**`.rssany.js`** 或 **`.rssany.ts`**  
- **ESM**，**`export default`** 导出 Site（或 enrich 插件约定）  
- 内置在仓库 `plugins/`；用户在 `.rssany/plugins/`  

### Site 接口

定义见 **`app/scraper/sources/web/site.ts`**。

**必填**：`id`，`listUrlPattern`  

**常用可选**：`detailUrlPattern`，`refreshInterval`（默认 `1day`），`proxy`，`parser`，`extractor`，`checkAuth` / `loginUrl` / `domain`，`enrichItem`，超时与轮询等  

**enrichItem 上下文**：`ctx.fetchHtml`，`ctx.extractItem`；即时资讯可不实现 enrich。

### 示例（节选）

```javascript
import { parse } from "node-html-parser";

function parser(html, url) {
  const root = parse(html);
  return root.querySelectorAll(".item").map((item) => ({
    title: item.querySelector(".title")?.textContent || "",
    link: new URL(item.querySelector("a")?.getAttribute("href"), url).href,
    description: item.querySelector(".summary")?.textContent || "",
  }));
}

export default {
  id: "example",
  listUrlPattern: "https://example.com/user/{userId}",
  detailUrlPattern: "https://example.com/post/{postId}",
  refreshInterval: "1h",
  proxy: "http://127.0.0.1:7890",
  parser,
  loginUrl: "https://example.com/login",
  domain: "example.com",
};
```

### `.rssany/sources.json` 中的覆盖

可对单源设置 `refresh`、`proxy` 等，优先级高于插件内声明。

```json
{
  "tech": {
    "title": "科技资讯",
    "sources": [
      {
        "ref": "https://example.com/user/123",
        "label": "示例站点",
        "refresh": "1h",
        "proxy": "http://127.0.0.1:7890"
      }
    ]
  }
}
```

**合法 refresh**：`10min` / `30min` / `1h` / `6h` / `12h` / `1day`（默认）/ `3day` / `7day`

### 代理优先级

```
sources.json 单源 proxy
  → FeederConfig.proxy（调用方）
  → Source / Site.proxy（插件）
  → process.env.HTTP_PROXY
```

---

## 开发原则

不把历史包袱带进新代码：当前按**开发阶段**迭代，**不做无意义 fallback，不做数据迁移脚本**（除非单独需求）。
