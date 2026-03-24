# research-any

> A research agent grounded in your feeds — any website, API, or email.

**research-any** is a universal content aggregation and research platform. It turns any webpage, RSS feed, or email inbox into a structured, searchable knowledge base — powering an on-site AI agent that can reason over your feeds, answer questions, and surface insights from your curated sources.

## Features

- **Feed to RSS**: Scrape any webpage by URL and serve it as a standard RSS feed
- **Multi-source aggregation**: Unify websites, RSS/Atom/JSON feeds, and IMAP email into a single timeline
- **Email inbox**: Pull newsletters via IMAP into the same feed
- **Smart parsing**: Custom parser functions or LLM-based parsing
- **Content extraction**: Custom extractors, Readability, or LLM extraction
- **Auto tagging & translation**: Built-in LLM pipeline — new items are tagged and translated automatically
- **Real-time push**: New content delivered to the UI via SSE, no polling needed
- **Auth management**: Puppeteer-based cookie management for login-required sites
- **Three-stage plugin system**: Source (scrape) → Enrich (full content) → Pipeline (post-processing)
- **Persistent storage**: Supabase (PostgreSQL) with full-text search; incremental upserts with deduplication
- **MCP server**: Expose your feeds as MCP tools for use in Claude, Cursor, and other AI clients

## Quick Start

### Requirements

- Node.js >= 20
- pnpm

### Install

```bash
pnpm install
cd webui && pnpm install && cd ..
```

### Configure

Copy the example configs:

```bash
cp sources.example.json .rssany/sources.json
cp channels.example.json .rssany/channels.json
```

Set up LLM (optional — for smart parsing, extraction, tagging, and translation):

```bash
export OPENAI_API_KEY=your_key
export OPENAI_BASE_URL=https://api.openai.com/v1
export OPENAI_MODEL=gpt-4o-mini
```

### Run

**Development** (HMR + hot reload):

```bash
# Terminal 1 — backend
pnpm dev

# Terminal 2 — frontend (http://localhost:5173)
cd webui && pnpm dev
```

**Production**:

```bash
cd webui && pnpm build && cd ..
pnpm start  # API at http://localhost:3751
```

## Architecture

Two ingestion paths converge into a shared cache and Supabase (PostgreSQL):

```
Websites / RSS / Email  ──►  Source plugin  ──►  Enrich plugin  ──►  Pipeline  ──►  DB
External scrapers       ──►  POST /api/gateway/items             ──►  Pipeline  ──►  DB
```

Consumption:

```
Web UI / RSS readers  ◄──  Backend API  ◄──  Supabase
                                │
                           Agent ◄──► Tools ◄──► MCP server
```

**Three-stage plugins**: Source (what to scrape) → Enrich (fetch full content) → Pipeline (tag, translate) — each item processed exactly once.

## Usage

### Generate RSS

**Query-based** (filter from DB):

```
GET /rss?search=AI&tags=tech&sourceUrl=https://...&lng=en&limit=50
```

**Scrape-based** (fetch live from source):

```
GET /rss/https://example.com/blog
```

### Subscribe to Sources

Define sources in `.rssany/sources.json`:

```json
{
  "sources": [
    { "ref": "https://sspai.com/feed", "label": "SSPAI" },
    { "ref": "https://example.com/blog", "label": "Example Blog", "refresh": "1h" },
    { "ref": "imaps://me%40gmail.com:token@imap.gmail.com:993/INBOX", "label": "Newsletter" }
  ]
}
```

Define channels in `.rssany/channels.json`:

```json
{
  "tech": {
    "title": "Tech",
    "sourceRefs": ["https://sspai.com/feed", "https://example.com/blog"]
  }
}
```

### Push from External Scrapers

```bash
curl -X POST http://localhost:3751/api/gateway/items \
  -H "Content-Type: application/json" \
  -d '{
    "sourceRef": "my-scraper",
    "items": [
      {
        "title": "Article Title",
        "link": "https://example.com/article/1",
        "pubDate": "2025-03-03T12:00:00Z",
        "summary": "Summary text",
        "content": "Full content (optional)"
      }
    ]
  }'
```

## Plugin Development

| Stage | Built-in dir | User dir | Responsibility |
|---|---|---|---|
| **sources** | `plugins/sources/` | `.rssany/plugins/sources/` | Define sources, scrape & parse item lists |
| **enrich** | `plugins/enrich/` | `.rssany/plugins/enrich/` | Fetch full content per item |
| **pipeline** | `plugins/pipeline/` | `.rssany/plugins/pipeline/` | Post-process (tag, translate, deliver) |

User plugins override built-in plugins with the same `id`.

### Source Plugin Example

```javascript
// .rssany/plugins/sources/example.rssany.js
import { parse } from "node-html-parser";

export default {
  id: "example",
  listUrlPattern: "https://example.com/user/{userId}",
  parser(html, url) {
    const root = parse(html);
    return root.querySelectorAll(".item").map(item => ({
      title: item.querySelector(".title")?.textContent || "",
      link: new URL(item.querySelector("a")?.getAttribute("href"), url).href,
      description: item.querySelector(".summary")?.textContent || "",
    }));
  },
};
```

### Pipeline Config

Control steps via `.rssany/config.json`:

```json
{
  "pipeline": {
    "steps": [
      { "id": "tagger", "enabled": true },
      { "id": "translator", "enabled": false }
    ]
  }
}
```

## Directory Structure

```
├── app/              Source code
│   ├── agent/        AI agent & tool definitions
│   ├── config/       Paths & global config
│   ├── core/         Infrastructure (cache, logger, events, LLM)
│   ├── db/           Supabase / PostgreSQL (FeedItem CRUD, search RPCs)
│   ├── feeder/       RSS generation core
│   ├── mcp/          MCP server (list_channels / get_feeds / feeds_search / web_search / ...)
│   ├── router/       HTTP routes (Hono)
│   └── scraper/      Scrapers (web / api / email / enrich)
├── plugins/          Built-in plugins
│   ├── sources/
│   ├── enrich/
│   └── pipeline/     tagger, translator
├── webui/            Frontend (SvelteKit)
└── .rssany/          User data (auto-created, gitignored)
    ├── sources.json
    ├── channels.json
    ├── tags.json
    ├── plugins/
    └── cache/
```

## License

MIT
