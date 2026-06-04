const SKILL_MARKDOWN = `# RssAny Agent Skill

你是正在使用 RssAny 的 agent。RssAny 是自托管 RSS / 订阅管线：把网页列表、RSS/Atom、邮件等信源定时抓取，经插件解析、入库去重、固定 pipeline 加工后，输出 RSS XML、JSON API 和 MCP。

## 什么时候使用

- 需要把网页列表、RSS/Atom、邮件等信源变成可订阅 feed。
- 需要读取本机 RssAny 已入库的 feeds/items。
- 需要为新网站编写或调整 RssAny 信源插件。
- 需要配置 \`~/.rssany/sources.json\`、\`~/.rssany/config.json\` 或 \`~/.rssany/plugins/\`。

## 安装与启动

推荐全局安装：

\`\`\`bash
npm install -g rssany
rssany start
\`\`\`

默认服务地址是：

\`\`\`text
http://127.0.0.1:18473/
\`\`\`

停止后台服务：

\`\`\`bash
rssany stop
\`\`\`

重置本地数据会删除用户数据目录，只有用户明确要求时才执行：

\`\`\`bash
rssany reset
\`\`\`

从源码运行：

\`\`\`bash
pnpm install
pnpm run webui:install
cp .env.example .env
pnpm run dev:all
\`\`\`

生产源码运行：

\`\`\`bash
pnpm run webui:build
pnpm start
\`\`\`

数据目录默认在 \`~/.rssany/\`，Windows 为 \`%USERPROFILE%\\.rssany\\\`。可用环境变量 \`RSSANY_USER_DIR\` 指向其他用户数据目录。

## 本地服务读取 feeds

先确认 RssAny 正在运行：

\`\`\`bash
curl http://127.0.0.1:18473/api/feed?limit=5
\`\`\`

读取已订阅信源的 JSON feed：

\`\`\`bash
curl "http://127.0.0.1:18473/api/feed?limit=50"
\`\`\`

按单个信源过滤。这里的 \`ref\` 必须与 \`~/.rssany/sources.json\` 中的 \`sources[].ref\` 一致：

\`\`\`bash
curl "http://127.0.0.1:18473/api/feed?ref=https%3A%2F%2Fexample.com%2Ffeed.xml&limit=20"
\`\`\`

读取 RSS XML：

\`\`\`bash
curl "http://127.0.0.1:18473/rss?subscribed=1&limit=50"
\`\`\`

按条件生成 RSS：

\`\`\`bash
curl "http://127.0.0.1:18473/rss?search=ai&tags=research&limit=50"
\`\`\`

按 URL 即时抓取并返回 RSS：

\`\`\`bash
curl "http://127.0.0.1:18473/rss/https://example.com/feed.xml"
\`\`\`

读取更完整的条目列表：

\`\`\`bash
curl "http://127.0.0.1:18473/api/items?limit=50"
\`\`\`

常用查询参数：

- \`limit\`: 最大返回数，通常不超过 200。
- \`offset\`: 分页偏移。
- \`ref\` 或 \`source\`: 按信源 ref 过滤。
- \`search\` 或 \`q\`: 搜索。
- \`tags\`: 逗号分隔标签。
- \`lng\`: 返回指定语言译文字段，如 \`zh-CN\` 或 \`en\`。

如果返回空列表，先检查 \`~/.rssany/sources.json\` 是否配置了信源，并等待调度抓取或访问对应 \`/rss/https://...\` 触发即时抓取。

## 配置信源

用户信源配置文件：

\`\`\`text
~/.rssany/sources.json
\`\`\`

结构是顶层 \`sources\` 数组：

\`\`\`json
{
  "sources": [
    {
      "ref": "https://example.com/feed.xml",
      "label": "Example",
      "description": "Example feed",
      "refresh": "1h",
      "proxy": "http://127.0.0.1:7890"
    }
  ]
}
\`\`\`

字段说明：

- \`ref\`: 必填。信源 URL 或自定义协议地址。
- \`label\`: 前端展示名称。
- \`description\`: 信源说明。
- \`refresh\`: 调度刷新间隔。稳定配置优先使用 \`10min\`、\`30min\`、\`1h\`、\`6h\`、\`12h\`、\`1day\`、\`3day\`、\`7day\`。
- \`proxy\`: 单信源代理，优先级高于插件内 proxy 和环境变量 \`HTTP_PROXY\`。
- \`weight\`: 可选权重，供排序或展示使用。

代理优先级：

\`\`\`text
sources.json 单源 proxy
  -> 调用方 FeederConfig.proxy
  -> 插件 Source/Site.proxy
  -> process.env.HTTP_PROXY
\`\`\`

## 配置 pipeline 与投递

用户配置文件：

\`\`\`text
~/.rssany/config.json
\`\`\`

pipeline 是固定代码链，不是用户插件目录。通过 \`pipeline.steps\` 控制是否启用：

\`\`\`json
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
\`\`\`

如果 \`deliver.url\` 非空，RssAny 会在写库与 pipeline 完成后向该 URL 出站 POST：

\`\`\`json
{
  "sourceRef": "https://example.com/feed.xml",
  "items": []
}
\`\`\`

没有单独的投递开关；有 \`deliver.url\` 就会投递。RssAny 不提供入站 Gateway，不要把它当作接收外部推送条目的 API。

## 编写插件

插件位置：

\`\`\`text
app/plugins/builtin/          # 内置插件，随包发布
~/.rssany/plugins/            # 用户插件，扁平放置，可覆盖同 id 内置插件
\`\`\`

文件后缀必须是：

\`\`\`text
.rssany.js
.rssany.ts
\`\`\`

插件是 ESM。推荐使用命名导出；也兼容 \`export default\` 导出对象。每个插件文件只导出一个合法 Site 或 Source。

### Site 插件

Site 插件用于网页列表站点。它通过 \`listUrlPattern\` 匹配 \`sources.json\` 的 \`ref\`，并在 \`fetchItems\` 内完成列表抓取、详情抓取和正文提取。

\`\`\`js
export const id = "example-site";
export const name = "Example Site";
export const listUrlPattern = /^https:\\/\\/example\\.com\\/news\\/?$/i;
export const refreshInterval = "1h";

export async function fetchItems(sourceId, ctx) {
  const { html } = await ctx.fetchHtml(sourceId, {
    waitMs: 800,
    purify: true
  });
  const root = ctx.deps.parseHtml(html);

  const items = root.querySelectorAll("article").map((node) => {
    const link = new URL(node.querySelector("a")?.getAttribute("href") ?? "/", sourceId).href;
    const title = node.querySelector("h2")?.textContent.trim() ?? "";
    return {
      guid: link,
      title,
      link,
      pubDate: new Date(),
      summary: node.querySelector("p")?.textContent.trim()
    };
  });

  return items;
}
\`\`\`

常用字段：

- \`id\`: 必填，唯一标识。
- \`listUrlPattern\`: 必填，字符串或正则，用于匹配信源 ref。
- \`fetchItems(sourceId, ctx)\`: 必填，返回 \`FeedItem[]\`。
- \`refreshInterval\`: 可选，默认通常为 \`1day\`。
- \`proxy\`: 可选，插件级代理。
- \`checkAuth\`、\`loginUrl\`、\`domain\`: 可选，用于需要站点登录的插件。

可用上下文：

- \`ctx.fetchHtml(url, opts)\`: 用浏览器抓取 HTML，可自动带站点 cookies。
- \`ctx.extractItem(item)\`: 对单条 item 做默认正文提取。
- \`ctx.deps.parseHtml\`: \`node-html-parser\`。
- \`ctx.deps.createHash\`: Node crypto hash。
- \`ctx.deps.RssParser\`: RSS parser。
- \`ctx.deps.logger\`: 日志。

用户插件尽量使用 \`ctx.deps\`，不要假设能从用户插件目录直接 import 项目依赖。

### Source 插件

Source 插件用于 RSS、邮件、自定义协议等更泛化的信源。它使用 \`pattern\` 或 \`match\` 匹配 \`sourceId\`，不要声明 \`listUrlPattern\`。

\`\`\`js
export const id = "example-api";
export const name = "Example API";
export const pattern = /^example-api:\\/\\//;
export const refreshInterval = "1h";

export async function fetchItems(sourceId, ctx) {
  const endpoint = sourceId.replace(/^example-api:\\/\\//, "https://api.example.com/");
  const res = await fetch(endpoint);
  const data = await res.json();

  return data.items.map((item) => ({
    guid: String(item.id),
    title: item.title,
    link: item.url,
    pubDate: new Date(item.published_at),
    summary: item.summary,
    content: item.content
  }));
}
\`\`\`

## FeedItem 输出约定

\`fetchItems\` 返回的每条 item 至少应包含：

\`\`\`js
{
  guid: "stable-unique-id",
  title: "Title",
  link: "https://example.com/item",
  pubDate: new Date()
}
\`\`\`

常用可选字段：

- \`author\`: 字符串数组。
- \`summary\`: 摘要。
- \`content\`: 正文 HTML 或文本。
- \`imageUrl\` 或 \`cover_img\`: 封面图 URL。
- \`categories\`: RSS 分类。
- \`tags\`: 系统或插件生成标签。
- \`extra\`: 扩展字段。

\`guid\` 要稳定，用原文 URL、源站 ID，或 \`ctx.deps.createHash("sha256").update(...).digest("hex")\` 生成。

## 调试插件

1. 把插件文件放入 \`~/.rssany/plugins/example.rssany.js\`。
2. 在 \`~/.rssany/sources.json\` 添加匹配该插件的 \`ref\`。
3. 重启 \`rssany start\`，或在开发模式等待重载。
4. 访问 \`/rss/<ref>\` 即时抓取，或访问 \`/api/feed?ref=<encoded-ref>\` 查看入库结果。
5. 查看 Web UI 的插件、日志、信源页面；管理接口通常需要登录且用户角色为 admin。

## 不要做的事

- 不要把 RSS XML 当作必须长期落盘的静态文件；它通常按请求或抓取流程生成。
- 不要把 \`~/.rssany/plugins/\` 当作 pipeline 插件目录；pipeline 在 \`app/pipeline/\`。
- 不要新增旧 Gateway 或 research-only 路由命名。
- 不要实现入站推送条目接口；RssAny 的投递是出站 \`deliver.url\`。
- 不要在用户未明确要求时执行 \`rssany reset\` 或删除 \`~/.rssany/\`。
`;

export function GET() {
  return new Response(SKILL_MARKDOWN, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}
