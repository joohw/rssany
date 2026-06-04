# RssAny 开发约定

本文件描述 RssAny 的代码风格、模块边界与常见模式，供贡献者与 AI 助手对齐预期。**产品重心是 RSS / 订阅管线（抓取 → 入库 → 输出 RSS/API）**；实现细节以代码与 [AGENTS.md](./AGENTS.md) 为准。

---

## 技术栈

| 层次 | 技术 |
|------|------|
| 运行时 | Node.js **20.x–23.x**（见 `package.json` `engines`），**ESM** |
| 包管理 | **pnpm**（根目录与 `webui/` 分别安装依赖） |
| 语言 | TypeScript（以 `tsconfig.json` / ESLint 为准） |
| HTTP | Hono + `@hono/node-server` |
| 数据库 | **SQLite**（Node.js 内置 `node:sqlite`），默认路径 `~/.rssany/data/rssany.db`（或 `RSSANY_USER_DIR`） |
| 浏览器自动化 | `puppeteer-core` |
| HTML / 正文 | `node-html-parser`、jsdom、`@mozilla/readability` |
| LLM（可选） | `openai`（兼容 OpenAI 式 HTTP API） |
| 前端 | SvelteKit（`webui/`），构建产物由后端托管 |
| 构建 | Vite（根与 `webui/` 各自配置） |
| 测试 | Vitest（`package.json` 中已配置；测试目录与命名见下） |

---

## 代码风格

### 格式规则

- **函数内部**：单函数内保持紧凑，避免无谓空行
- **函数之间**：模块内函数之间空行适度（常见为**空两行**，与周边文件保持一致即可）
- **函数开头**：复杂或非显然的函数顶部用**一行中文注释**说明用途；显而易见的可省略
- **缩进**：2 空格
- **引号**：TypeScript/JavaScript 以**双引号**为主；Svelte 模板遵循项目格式化工具输出
- **分号**：省略（与现有文件一致）

### TypeScript 规范

- 公共类型用 `interface` / `type`，放在同目录 `types.ts` 或与模块同文件（与现有模块一致即可）
- 避免 `any`，优先 `unknown` 再收窄
- 异步统一 `async/await`
- 应用代码以**命名导出**为主；**插件**（`*.rssany.{js,ts}`）必须 **`export default`** 一个符合 `Site` 的对象

### 命名约定

| 类型 | 风格 | 示例 |
|------|------|------|
| 变量 / 函数 | camelCase | `fetchItems`, `cacheKey` |
| 类 / 接口 | PascalCase | `FeedItem`, `Source` |
| 常量 | camelCase（非强制 UPPER_SNAKE） | `defaultRefreshInterval` |
| 文件名 | kebab-case 或 camelCase（与目录内已有风格一致） | `pluginLoader.ts` |
| 插件文件 | `{id}.rssany.{js,ts}` | `rss.rssany.js` |

---

## 架构约定

### 模块边界

- 各包通过 `index.ts`（或明确入口）对外暴露能力；**优先依赖公开 API**，避免跨模块引用深层内部文件（与现有代码一致即可）
- **路由层**（`app/router/`）负责 HTTP 形态、鉴权与错误码；核心业务在 `feeder`、`scraper`、`db`、`pipeline` 等模块

### 数据流（摘要）

```
HTTP / 调度器 → feeder 协调
  → getSource() → fetchItems()（列表抓取与解析）
  → upsertItems()（写库、去重）
  → pipeline（固定链，每条一次）→ updateItemContent()
  → buildRssXml() / API 返回
  → deliver.url 出站 POST（非「外部推条目入站」）
```

### 错误处理

- 业务错误用自定义 `Error` 子类或明确错误码，在模块内定义
- HTTP 层统一捕获并映射为合适状态码与 JSON
- 抓取与 pipeline 失败以日志为主，不拖垮主流程（与现有实现一致）
---

## 测试约定

- 使用 **Vitest**（`pnpm test` / `pnpm test:run`）
- 新增测试时：可放在仓库根 `tests/`，或与被测文件同目录的 `*.test.ts`；命名建议能看出模块与行为（如 `feeder-upsert.unit.test.ts`）
- 单元测试对 Puppeteer、LLM、外网请求做 mock；e2e 若打真实网络需在 CI 中跳过或单独 job


---


## 开发原则

与 [AGENTS.md](./AGENTS.md) 一致：当前阶段**不做无意义 fallback**；**不做数据迁移脚本**（除非单独需求）。新功能不要假设备库 Supabase、入站 Gateway 或已删除的 research-only 模块。
