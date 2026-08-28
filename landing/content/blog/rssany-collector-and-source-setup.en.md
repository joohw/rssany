---
title: RssAny collectors and config.json setup
description: Use built-in Site collectors, custom .rssany.js files, and config.json sources to add web/RSS/email sources with refresh policies.
date: 2026-05-22
---

RssAny extends through **Site collectors + declarative source config**. Add new sites without forking the core repo: dozens of built-in `.rssany.js` files, plus overrides in `~/.rssany/collectors`.

## Source types

| Type | Config highlights | Best for |
| --- | --- | --- |
| Site collector | `type: "site"`, `collector` name | News lists, forums, sites without RSS |
| RSS/Atom | standard feed URL | Publishers with feeds |
| IMAP mail | mailbox + folder | newsletters, list mail |

## config.json sources shape

Each source typically defines:

- `id` — unique key
- `type` — `site` / `rss` / `imap`, etc.
- `interval` — refresh seconds
- `proxy` — optional
- collector-specific fields (list URL, selectors, …)

After editing `config.json` sources, scheduling refreshes automatically; items land in SQLite and logs appear in the Web UI.

## Custom collectors

1. Drop `my-source.rssany.js` into `~/.rssany/collectors/`.
2. Implement list fetch + detail parsing (see built-ins and [collectors.md](https://github.com/joohw/rssany/blob/main/docs/collectors.md)).
3. Reference the collector name in `config.json` sources.

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
