---
title: 为内容管线定制专属信息源
description: RssAny 如何把网页列表、RSS 与邮件信源接入同一套抓取、解析与输出管线，服务内容生产与资讯工作流。
date: 2026-05-20
---

内容团队常见痛点不是「缺 RSS 阅读器」，而是**信源形态分散**：官网新闻列表、订阅邮件、标准 RSS、需要登录的网页——各自刷新节奏不同，入库格式不统一，后续打标签、翻译、分发都要重复写胶水代码。

## RssAny 解决什么问题

RssAny 是自托管的信息源定制与订阅管线：

1. **接入** — 内置 Site 插件（`.rssany.js`）、标准 RSS/Atom、IMAP 邮件。
2. **抓取** — 按 `sources.json` 配置刷新间隔与代理。
3. **解析** — 插件把列表页/详情页转成统一条目结构。
4. **加工** — 固定 pipeline（打标签、翻译、正文提取等，见 `config.json`）。
5. **输出** — RSS/Atom/JSON Feed、JSON API、MCP，供创作与分发工具消费。

数据落在本地 SQLite（默认 `~/.rssany/data/rssany.db`），配置在 `~/.rssany/`，升级 npm 包不会覆盖你的信源。

## 典型工作流

- **资讯编辑**：定制 10 个行业站点 + 2 个邮件列表 → pipeline 自动打标签 → 输出 JSON API 给 CMS。
- **内容运营**：抓取竞品更新 → 翻译摘要 → 通过 MCP 喂给 Agent 写稿。
- **个人阅读**：自托管替代 SaaS 聚合，保留插件扩展能力。

## 快速开始

```bash
npm install -g rssany
rssany
# 浏览器打开 http://127.0.0.1:18473/
```

首次运行会在 `~/.rssany/` 生成 `sources.json` 与 `config.json`。

## 延伸阅读

- 了解 [pipeline 能力](/#pipeline)
- 阅读插件文档：[GitHub README](https://github.com/joohw/rssany#readme)
