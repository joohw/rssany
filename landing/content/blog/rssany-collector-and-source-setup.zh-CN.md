---
title: RssAny 信源采集器与 config.json 配置入门
description: 如何用内置站点采集器、自定义 .rssany.js 与 config.json 的 sources 接入网页/RSS/邮件信源并设置刷新策略。
date: 2026-05-22
---

RssAny 的可扩展性来自 **采集器 + 声明式信源配置**。你不需要 fork 主项目就能接入新站点：内置大量 `.rssany.js`，也可在 `~/.rssany/collectors` 覆盖或扩展。

## 信源类型一览

| 类型 | 配置要点 | 适用场景 |
| --- | --- | --- |
| 站点采集器 | `type: "site"` | 新闻列表、论坛、无 RSS 的站点 |
| RSS/Atom | 标准 feed URL | 已有 RSS 的媒体 |
| IMAP 邮件 | 邮箱账号与文件夹 | 订阅邮件、列表推送 |

## config.json 的 sources 示例结构

每个信源包含：

- `id` — 唯一标识
- `type` — `site` / `rss` / `imap` 等
- `interval` — 刷新间隔（秒）
- `proxy` — 可选代理
- 采集器特有字段（如列表 URL、选择器）

修改 `config.json` 的 sources 后会自动刷新调度；条目写入 SQLite，可在 Web UI 查看日志。

## 自定义采集器

1. 在 `~/.rssany/collectors/` 放置 `my-source.rssany.js`。
2. 实现列表抓取与详情解析（参考内置采集器与 [collectors.md](https://github.com/joohw/rssany/blob/main/docs/collectors.md)）。
3. 在 `config.json` 的 sources 中引用采集器名。

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
