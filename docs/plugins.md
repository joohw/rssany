# 信源插件配置（Site / Source）

RSSAny 通过 **`.rssany.js` / `.rssany.ts`** 插件扩展「非标准 RSS」站点或其它协议的信源解析。实现细节以代码为准；接口定义见仓库内类型文件。

---

## 放置位置

| 位置 | 说明 |
|------|------|
| **`app/plugins/builtin/`** | 随仓库 / npm 包发布的初始化种子；运行时不直接加载 |
| **`~/.rssany/plugins/`**（Windows：`%USERPROFILE%\.rssany\plugins\`） | 唯一运行时插件目录，**扁平**放文件；初始化复制进来的插件也可直接修改或删除 |

仅识别后缀 **`.rssany.js`** 与 **`.rssany.ts`**。子目录中的文件不会被扫描。

首次执行 `initUserDir()` 时，RssAny 会把包内种子复制到用户目录，并写入
`~/.rssany/plugins/.builtin-plugins-initialized.json`。已有同名文件会保留；标记文件存在后，后续启动和升级不会覆盖修改，也不会补回用户已经删除的插件。

若需要恢复当前安装包的全部默认插件，可先备份自己的插件，然后删除该标记文件并重新启动；RssAny 只会补齐缺失文件，不会覆盖仍存在的同名文件。

---

## 模块格式

- **ESM**. Recommended protocol: named exports (`export const id`, `export const listUrlPattern`, `export async function fetchItems`). `export default` is still accepted for existing plugins, but new plugins should not need it.
- 每个文件应导出 **一个** 合法的 **Site** 或 **Source** 实现；加载失败或结构不符会在日志中告警并跳过（见 `app/plugins/loader.ts`）。

---

## Field Layout Convention

Plugin files should keep predefined declarative fields together at the top of the exported object. Do not scatter `id`, `listUrlPattern`, `pattern`, `refreshInterval`, `proxy`, auth fields, or similar metadata near the bottom of the file.

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

## Site插件（网页列表站）

用于「列表 URL 匹配 `listUrlPattern`、在 `fetchItems` 里抓列表与详情」的站点。

**类型定义**：`app/scraper/sources/web/site.ts` 中的 `Site`、`SiteContext`。

**必填**

- `id`：唯一标识，如 `my-site`
- `listUrlPattern`：字符串（支持 `{segment}` 占位）或 `RegExp`，用于匹配 `config.json` 的 `sources[].ref`
- `fetchItems(sourceId, ctx)`：返回 `Promise<FeedItem[]>`

**常用可选**

- `refreshInterval`：条目缓存/调度窗口（不填默认 `1day`）
- `proxy`：该站代理；仍可被 `config.json` 的单源设置或环境变量覆盖（见下）
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

## 与 `config.json` 的关系

- 订阅地址写在 **`~/.rssany/config.json`** 顶层 **`sources`** 数组的 `ref` 中。
- 调度器会选用 **最匹配的 Site / Source** 处理该 `ref`。
- 单条信源可覆盖 **`refresh`**、**`proxy`** 等，优先级一般高于插件内声明（具体合并逻辑见 scraper/feeder 实现）。

合法 **`refresh`**：`10min`、`30min`、`1h`、`6h`、`12h`、`1day`（默认）、`3day`、`7day`。

---

## 管理界面

管理员可在 Web **`/plugins`** 查看已加载插件、**登录 / 检查登录**（若插件声明了认证），并**新建 / 编辑**用户目录下的插件文件（对应 `~/.rssany/plugins/`）。初始化复制的默认插件与后来创建的插件采用相同管理方式。

---

## 后端管理 API

以下接口均经过 `requireAdmin()` 中间件。当前本地运行模式下该中间件不校验令牌，因此不要把插件管理 API 直接暴露到不可信网络：

| 方法 | 路径 | 作用 |
|------|------|------|
| `GET` | `/api/plugins` | 列出用户目录中当前生效的插件 |
| `POST` | `/api/plugins` | 根据模板创建用户 Site 插件 |
| `GET` | `/api/plugins/:id` | 读取当前生效插件的完整源码与来源 |
| `PUT` | `/api/plugins/:id` | 创建或覆盖插件源码 |
| `DELETE` | `/api/plugins/:id` | 删除插件 |

管理操作遵循以下边界：

- 读取、写入和删除始终发生在 **`~/.rssany/plugins/`**，不会修改仓库或 npm 包中的种子文件。
- 初始化复制的默认插件可以直接 `PUT` 修改，也可以 `DELETE` 删除；删除后不会回退到包内版本。
- 插件源码上限为 **2 MiB**。写入后会立即重载并验证导出的 `id`、Site / Source 字段与 `fetchItems()`；验证失败会回滚原文件。
- 插件重载使用文件版本绕过 ESM 模块缓存，成功响应后运行时已使用新代码。

---

## MCP 管理工具

本地 MCP 服务提供以下插件工具：

- `list_plugins`：列出用户目录中当前已加载的插件。
- `read_plugin`：按 `id` 读取当前生效插件的完整源码。
- `write_plugin`：创建或更新插件并立即重载。
- `delete_plugin`：删除用户目录中的插件。

`write_plugin` 会执行插件模块代码，因此只应向可信的本地 MCP 客户端开放。RssAny 的 MCP HTTP/SSE 路由默认仅允许本机回环地址；显式设置 `RSSANY_MCP_ALLOW_REMOTE=1` 才允许远程访问。

---

## 与 Pipeline 的区别

**`app/pipeline/`**（标签、翻译等）是**固定内置链**，由 **`config.json`** 的 `pipeline.steps` 开关；**不是** `.rssany/plugins/` 下的插件。详见主 **[README](../README.md)** 与 **[AGENTS.md](../AGENTS.MD)**。

---

## 参考代码

- 初始化复制：`app/config/paths.ts`
- 单目录加载：`app/plugins/loader.ts`
- 默认 Site 种子：`app/plugins/builtin/*.rssany.js`
- 宿主注入依赖说明：`app/plugins/hostDeps.ts`（若存在）
