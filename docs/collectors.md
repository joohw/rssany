# 采集器开发与管理

RSSAny 通过 **`.rssany.js` / `.rssany.ts`** 采集器扩展「非标准 RSS」站点或其它协议的信源解析。实现细节以代码为准；接口定义见仓库内类型文件。

---

## 放置位置

| 位置 | 说明 |
|------|------|
| **`app/collectors/builtin/`** | 随仓库 / npm 包发布的初始化种子；运行时不直接加载 |
| **`~/.rssany/collectors/`**（Windows：`%USERPROFILE%\.rssany\collectors\`） | 唯一运行时采集器目录，**扁平**放文件；初始化复制进来的采集器也可直接修改或删除 |

仅识别后缀 **`.rssany.js`** 与 **`.rssany.ts`**。子目录中的文件不会被扫描。

首次执行 `initUserDir()` 时，RssAny 会把包内种子复制到用户目录，并写入
`~/.rssany/collectors/.builtin-collectors-initialized.json`。已有同名文件会保留；标记文件存在后，后续启动和升级不会覆盖修改，也不会补回用户已经删除的采集器。

若需要恢复当前安装包的全部默认采集器，可先备份自己的采集器，然后删除该标记文件并重新启动；RssAny 只会补齐缺失文件，不会覆盖仍存在的同名文件。

---

## 模块格式

- **ESM**. Recommended protocol: named exports (`export const id`, `export const listUrlPattern`, `export async function fetchItems`). `export default` is still accepted for existing collectors, but new collectors should not need it.
- 每个文件应导出 **一个** 合法的 **SiteCollector** 或 **Collector** 实现；加载失败或结构不符会在日志中告警并跳过（见 `app/collectors/loader.ts`）。

---

## Field Layout Convention

Collector files should keep predefined declarative fields together at the top of the exported object. Do not scatter `id`, `listUrlPattern`, `pattern`, `refreshInterval`, `proxy`, auth fields, or similar metadata near the bottom of the file.

Recommended shape:

```js
export const id = "my-site";
export const listUrlPattern = /^https:\/\/example\.com\/?$/i;
export const refreshInterval = "1day";
export const proxy = undefined;

export async function fetchItems(sourceId, ctx) {
  // implementation
  return [];
}
```
---

## SiteCollector（网页列表站采集器）

用于「列表 URL 匹配 `listUrlPattern`、在 `fetchItems` 里抓列表与详情」的站点。

**类型定义**：`app/scraper/sources/web/site.ts` 中的 `SiteCollector`、`SiteCollectorContext`。

**必填**

- `id`：唯一标识，如 `my-site`
- `listUrlPattern`：字符串（支持 `{segment}` 占位）或 `RegExp`，用于匹配 `config.json` 的 `sources[].ref`
- `fetchItems(sourceId, ctx)`：返回 `Promise<FeedItem[]>`

**常用可选**

- `refreshInterval`：条目缓存/调度窗口（不填默认 `1day`）
- `proxy`：采集器自身声明的代理；已配置到 `sources` 的信源以信源级显式策略为准
- **站点登录**：`checkAuth`、`loginUrl`；可选 `domain`、`loginTimeoutMs`、`pollIntervalMs`（Cookie 落在 `~/.rssany/cache/domains/`）

**上下文 `SiteCollectorContext`（摘要）**

- `ctx.fetchHtml(url, opts?)`：无头/有头浏览器拉 HTML（自动带 Cookie）
- `ctx.extractItem(item)`：对单条用 Readability 等默认正文提取
- `ctx.deps`：宿主注入的解析依赖；**用户采集器不要从 npm 直接 import 替代依赖包**，应使用 `deps`

---

## Collector（协议 / 泛匹配采集器）

用于 **RSS、邮件、自定义协议** 等与「站点列表 URL」模型不同的信源：用 `pattern`（或 `match`）匹配 `sourceId`，**没有** `listUrlPattern`。

**类型定义**：`app/scraper/sources/types.ts` 中的 `Collector`、`CollectorContext`。

**必填**

- `id`
- `pattern`（或配合 `match`）
- `fetchItems(sourceId, ctx)`

**注意**：若某 `Collector.id` 与已有 **SiteCollector** 的 `id` 相同，加载器会忽略该 Collector 的路径映射（避免冲突），以 SiteCollector 为准。

---

## 与 `config.json` 的关系

- 订阅地址写在 **`~/.rssany/config.json`** 顶层 **`sources`** 数组的 `ref` 中。
- 单条信源可用 **`group`** 字符串数组表达分组路径，例如 `"group": ["技术", "前端"]`；省略或 `[]` 表示根路径。信源仍以扁平数组存储，嵌套只由路径表达。
- `GET /api/sources/groups` 返回当前分组树；每个节点包含 `name`、完整 `path`、含后代的 `sourceCount` 与 `children`，可直接用于分组选择器。
- 调度器会选用最匹配的采集器处理该 `ref`。
- 单条信源通过 **`proxyMode`** 选择代理策略：`none`（默认直连）、`default`（使用代理设置页的默认代理）、`custom`（使用该信源的 `proxy` 地址）。旧配置中只有 `proxy` 时按 `custom` 兼容。
- 默认代理不会自动应用到全部信源；通常只给需要代理的境外信源显式选择 `default` 或 `custom`。

合法 **`refresh`**：`10min`、`30min`、`1h`、`6h`、`12h`、`1day`（默认）、`3day`、`7day`。

---

## 管理界面

管理员可在 Web **`/collectors`** 查看已加载采集器、**登录 / 检查登录**（若采集器声明了认证），并**新建 / 编辑**用户目录下的采集器文件（对应 `~/.rssany/collectors/`）。初始化复制的默认采集器与后来创建的采集器采用相同管理方式。

---

## 后端管理 API

RssAny 是本地工具，以下接口直接提供给本地 WebUI 和自动化调用，不经过管理员认证中间件：

| 方法 | 路径 | 作用 |
|------|------|------|
| `GET` | `/api/collectors` | 列出用户目录中当前生效的采集器 |
| `POST` | `/api/collectors` | 根据模板创建用户站点采集器 |
| `GET` | `/api/collectors/:id` | 读取当前生效采集器的完整源码与来源 |
| `PUT` | `/api/collectors/:id` | 创建或覆盖采集器源码 |
| `DELETE` | `/api/collectors/:id` | 删除采集器 |

管理操作遵循以下边界：

- 读取、写入和删除始终发生在 **`~/.rssany/collectors/`**，不会修改仓库或 npm 包中的种子文件。
- 初始化复制的默认采集器可以直接 `PUT` 修改，也可以 `DELETE` 删除；删除后不会回退到包内版本。
- 采集器源码上限为 **2 MiB**。写入后会立即重载并验证导出的 `id`、SiteCollector / Collector 字段与 `fetchItems()`；验证失败会回滚原文件。
- 采集器重载使用文件版本绕过 ESM 模块缓存，成功响应后运行时已使用新代码。

---

## MCP 管理工具

本地 MCP 服务提供以下采集器工具：

- `list_collectors`：列出用户目录中当前已加载的采集器。
- `read_collector`：按 `id` 读取当前生效采集器的完整源码。
- `write_collector`：创建或更新采集器并立即重载。
- `delete_collector`：删除用户目录中的采集器。

`write_collector` 会执行采集器模块代码，因此只应向可信的本地 MCP 客户端开放。RssAny 的 MCP HTTP/SSE 路由默认仅允许本机回环地址；显式设置 `RSSANY_MCP_ALLOW_REMOTE=1` 才允许远程访问。

---

## 与 Pipeline 的区别

**`app/pipeline/`**（标签、翻译等）是**固定内置链**，由 **`config.json`** 的 `pipeline.steps` 开关；**不是** `.rssany/collectors/` 下的采集器。详见主 **[README](../README.md)** 与 **[AGENTS.md](../AGENTS.MD)**。

---

## 参考代码

- 初始化复制：`app/config/paths.ts`
- 单目录加载：`app/collectors/loader.ts`
- 默认采集器种子：`app/collectors/builtin/*.rssany.js`
- 宿主注入依赖说明：`app/collectors/hostDeps.ts`（若存在）
