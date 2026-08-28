# Pipeline 开发与管理

Pipeline 在抓取条目入库后按编排顺序逐条执行。单个 Pipeline 接收一个 `FeedItem`，返回处理后的 `FeedItem`；返回 `null` 会过滤该条目并从数据库删除刚写入的记录。

## 文件与契约

用户 Pipeline 位于 `.rssany/pipelines/*.rssany.js`。文件必须是 ESM，并默认导出以下对象：

```js
export default {
  id: "remove-empty",
  name: "过滤空内容",
  description: "移除没有标题和正文的条目",

  async process(item, context) {
    if (!item.title?.trim() && !item.content?.trim()) return null;
    return item;
  },
};
```

- `id`：字母或下划线开头，仅含字母、数字、下划线和连字符，最长 64 字符；必须与上传请求中的 `id` 相同。
- `name`：管理页展示名称。
- `description`：可选说明。
- `process(item, context)`：可以同步或异步；返回 `FeedItem` 或 `null`。
- `context.sourceUrl`：当前信源标识。
- `context.llm`：已配置时提供 `chatJson` / `chatText`。
- `context.db`：提供 `getSystemTags()`。

建议保留条目的 `guid`、`link`、`sourceRef`；这些字段用于入库与去重。步骤抛出异常时，运行器记录警告并保留进入该步骤前的条目。

## HTTP API

上传与源码管理会执行任意 Node.js 代码，因此 `POST`、源码 `GET`、`PUT`、`DELETE` 和校验接口只接受本机 socket 连接；带 `Origin` 的浏览器请求还必须来自 `localhost`、`127.0.0.1` 或 `::1`，防止外部网页借开放 CORS 调用本机接口。列表与编排接口可正常供 WebUI 使用。

| 方法 | 路径 | 作用 |
|------|------|------|
| `GET` | `/api/pipelines` | 列出内置和用户 Pipeline 元数据 |
| `POST` | `/api/pipelines/validate` | 校验 `{ id, content }`，不保存 |
| `POST` | `/api/pipelines` | 上传 `{ id, content }` |
| `GET` | `/api/pipelines/:id` | 读取用户 Pipeline 源码 |
| `PUT` | `/api/pipelines/:id` | 使用 `{ content }` 更新源码 |
| `DELETE` | `/api/pipelines/:id` | 删除用户 Pipeline，并从编排移除 |
| `GET` | `/api/pipeline` | 获取当前编排和可用 Pipeline |
| `PUT` | `/api/pipeline` | 保存 `{ steps: [{ id }] }` 编排 |

上传示例：

```bash
curl -X POST http://127.0.0.1:18473/api/pipelines \
  -H "Content-Type: application/json" \
  --data-binary '{"id":"remove-empty","content":"export default { id: \"remove-empty\", name: \"过滤空内容\", process(item) { return item.content?.trim() ? item : null; } };"}'
```

写入采用临时文件和原子替换。新代码无法导入、导出字段无效或导出 `id` 不一致时，API 返回 `422` 并恢复先前文件。上传成功后注册表立即刷新，无需重启服务。
