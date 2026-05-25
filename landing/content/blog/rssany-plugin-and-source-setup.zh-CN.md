---
title: RssAny 信源插件与 sources.json 配置入门
description: 如何用内置 Site 插件、自定义 .rssany.js 与 sources.json 接入网页/RSS/邮件信源并设置刷新策略。
date: 2026-05-22
---

RssAny 的可扩展性来自 **Site 插件 + 声明式信源配置**。你不需要 fork 主项目就能接入新站点：内置大量 `.rssany.js`，也可在 `~/.rssany/plugins` 覆盖或扩展。

## 信源类型一览

| 类型 | 配置要点 | 适用场景 |
| --- | --- | --- |
| Site 插件 | `type: "site"`, `plugin` 名称 | 新闻列表、论坛、无 RSS 的站点 |
| RSS/Atom | 标准 feed URL | 已有 RSS 的媒体 |
| IMAP 邮件 | 邮箱账号与文件夹 | 订阅邮件、列表推送 |

## sources.json 示例结构

每个信源包含：

- `id` — 唯一标识
- `type` — `site` / `rss` / `imap` 等
- `interval` — 刷新间隔（秒）
- `proxy` — 可选代理
- 插件特有字段（如列表 URL、选择器）

修改 `sources.json` 后重启或触发刷新即可生效；条目写入 SQLite，可在 Web UI 查看日志。

## 自定义插件

1. 在 `~/.rssany/plugins/` 放置 `my-source.rssany.js`。
2. 实现列表抓取与详情解析（参考内置插件与 [plugins.md](https://github.com/joohw/rssany/blob/main/docs/plugins.md)）。
3. 在 `sources.json` 引用插件名。

## pipeline 与输出

解析后的条目进入固定 pipeline（标签、翻译等），可在 `config.json` 启用 LLM 步骤。加工完成后：

- 订阅输出：RSS / JSON Feed
- 集成输出：JSON API、MCP

详见首页 [管线说明](/#pipeline)。

## 立即尝试

```bash
npm install -g rssany
rssany
```
