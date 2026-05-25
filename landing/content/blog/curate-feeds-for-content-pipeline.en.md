---
title: Curate dedicated feeds for your content pipeline
description: How RssAny unifies web lists, RSS, and email sources into one fetch-parse-publish pipeline for editorial and news workflows.
date: 2026-05-20
---

Editorial teams rarely lack another RSS reader — they lack **one pipeline** for scattered sources: news pages, subscription mail, standard feeds, and authenticated sites, each with different refresh cadences and inconsistent item shapes.

## What RssAny does

RssAny is a self-hosted curation and subscription pipeline:

1. **Ingest** — built-in Site plugins (`.rssany.js`), RSS/Atom, IMAP mail.
2. **Fetch** — refresh intervals and proxies from `sources.json`.
3. **Parse** — plugins normalize list/detail pages into a shared item model.
4. **Enrich** — fixed pipeline steps (tagging, translation, extraction) via `config.json`.
5. **Publish** — RSS/Atom/JSON Feed, JSON API, and MCP for downstream tools.

Items live in local SQLite (default `~/.rssany/data/rssany.db`); config under `~/.rssany/` survives package upgrades.

## Typical workflows

- **News desk** — curate industry sites + mailing lists → auto-tag in pipeline → JSON API into your CMS.
- **Content ops** — track competitor updates → translate summaries → MCP into agent drafting tools.
- **Personal reading** — self-hosted aggregation with plugin extensibility.

## Quick start

```bash
npm install -g rssany
rssany
# open http://127.0.0.1:18473/
```

First run creates `sources.json` and `config.json` under `~/.rssany/`.

## Read next

- See [pipeline features](/#pipeline)
- Plugin docs on [GitHub](https://github.com/joohw/rssany#readme)
