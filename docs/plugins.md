# 信源插件配置（Site / Source）

RSSAny 通过 **`.rssany.js` / `.rssany.ts`** 插件扩展「非标准 RSS」站点或其它协议的信源解析。实现细节以代码为准；接口定义见仓库内类型文件。

---

## 放置位置

| 位置 | 说明 |
|------|------|
| **`app/plugins/builtin/`** | 内置插件（随仓库 / npm 包发布） |
| **`~/.rssany/plugins/`**（Windows：`%USERPROFILE%\.rssany\plugins\`） | 用户插件，**扁平**放文件；**同 `id` 会覆盖内置** |

仅识别后缀 **`.rssany.js`** 与 **`.rssany.ts`**。子目录中的文件不会被扫描。

---

## 模块格式

- **ESM**，默认导出插件对象：`export default { ... }`（或 `export default site`）。
- 每个文件应导出 **一个** 合法的 **Site** 或 **Source** 实现；加载失败或结构不符会在日志中告警并跳过（见 `app/plugins/loader.ts`）。

---

## Site 插件（网页列表站）

用于「列表 URL 匹配 `listUrlPattern`、在 `fetchItems` 里抓列表与详情」的站点。

**类型定义**：`app/scraper/sources/web/site.ts` 中的 `Site`、`SiteContext`。

**必填**

- `id`：唯一标识，如 `my-site`
- `listUrlPattern`：字符串（支持 `{segment}` 占位）或 `RegExp`，用于匹配 `sources.json` 里的 `ref`
- `fetchItems(sourceId, ctx)`：返回 `Promise<FeedItem[]>`

**常用可选**

- `refreshInterval`：条目缓存/调度窗口（不填默认 `1day`）
- `proxy`：该站代理；仍可被 `sources.json` 单源或环境变量覆盖（见下）
- **站点登录**：`checkAuth`、`loginUrl`；可选 `domain`、`loginTimeoutMs`、`pollIntervalMs`（Cookie 落在 `~/.rssany/cache/domains/`）

**上下文 `SiteContext`（摘要）**

- `ctx.fetchHtml(url, opts?)`：无头/有头浏览器拉 HTML（自动带 Cookie）
- `ctx.extractItem(item)`：对单条用 Readability 等默认正文提取
- `ctx.deps`：宿主注入的解析依赖；**用户插件不要从 npm 直接 import 替代依赖包**，应使用 `deps`

---

## Source 插件（协议 / 泛匹配）

用于 **RSS、邮件、自定义协议** 等与「站点列表 URL」模型不同的信源：用 `pattern`（或 `match`）匹配 `sourceId`，**没有** `listUrlPattern`。

**类型定义**：`app/scraper/sources/types.ts` 中的 `Source`、`SourceContext`。

**必填**

- `id`
- `pattern`（或配合 `match`）
- `fetchItems(sourceId, ctx)`

**注意**：若某 `Source.id` 与已有 **Site** 的 `id` 相同，加载器会忽略该 Source 的路径映射（避免冲突），以 Site 为准。

---

## 与 `sources.json` 的关系

- 订阅地址写在 **`~/.rssany/sources.json`** 顶层 **`sources`** 数组的 `ref`（等形式）中。
- 调度器会选用 **最匹配的 Site / Source** 处理该 `ref`。
- 单条信源可覆盖 **`refresh`**、**`proxy`** 等，优先级一般高于插件内声明（具体合并逻辑见 scraper/feeder 实现）。

合法 **`refresh`**：`10min`、`30min`、`1h`、`6h`、`12h`、`1day`（默认）、`3day`、`7day`。

---

## 管理界面

管理员可在 Web **`/plugins`** 查看已加载插件、**登录 / 检查登录**（若插件声明了认证），并**新建 / 编辑**用户目录下的插件文件（对应 `~/.rssany/plugins/`）。

---

## 与 Pipeline 的区别

**`app/pipeline/`**（标签、翻译等）是**固定内置链**，由 **`config.json`** 的 `pipeline.steps` 开关；**不是** `.rssany/plugins/` 下的插件。详见主 **[README](../README.md)** 与 **[AGENTS.md](../AGENTS.MD)**。

---

## 参考代码

- 加载与合并：`app/plugins/loader.ts`
- Site 示例：`app/plugins/builtin/*.rssany.js`
- 宿主注入依赖说明：`app/plugins/hostDeps.ts`（若存在）
