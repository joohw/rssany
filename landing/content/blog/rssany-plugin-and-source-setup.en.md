---
title: RssAny plugins and sources.json setup
description: Use built-in Site plugins, custom .rssany.js files, and sources.json to add web/RSS/email sources with refresh policies.
date: 2026-05-22
---

RssAny extends through **Site plugins + declarative source config**. Add new sites without forking the core repo: dozens of built-in `.rssany.js` files, plus overrides in `~/.rssany/plugins`.

## Source types

| Type | Config highlights | Best for |
| --- | --- | --- |
| Site plugin | `type: "site"`, `plugin` name | News lists, forums, sites without RSS |
| RSS/Atom | standard feed URL | Publishers with feeds |
| IMAP mail | mailbox + folder | newsletters, list mail |

## sources.json shape

Each source typically defines:

- `id` — unique key
- `type` — `site` / `rss` / `imap`, etc.
- `interval` — refresh seconds
- `proxy` — optional
- plugin-specific fields (list URL, selectors, …)

After editing `sources.json`, restart or refresh; items land in SQLite and logs appear in the Web UI.

## Custom plugins

1. Drop `my-source.rssany.js` into `~/.rssany/plugins/`.
2. Implement list fetch + detail parsing (see built-ins and [plugins.md](https://github.com/joohw/rssany/blob/main/docs/plugins.md)).
3. Reference the plugin name in `sources.json`.

## Pipeline & outputs

Parsed items run through the fixed pipeline (tagging, translation, …); toggle LLM steps in `config.json`. Then publish via:

- Subscriptions: RSS / JSON Feed
- Integrations: JSON API, MCP

See [pipeline on the home page](/#pipeline).

## Try it

```bash
npm install -g rssany
rssany
```
