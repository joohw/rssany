# HTTP API

Default base URL: `http://127.0.0.1:18473`.

## Primary read APIs

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/server-info` | Health check, port, and LAN URL |
| GET | `/api/skill` | Official Skill metadata and core `SKILL.md` |
| GET | `/api/skill.zip` | Complete installable `rssany/` Skill archive |
| GET | `/api/feed` | Subscribed feed items plus source metadata |
| GET | `/api/items` | Search and paginate indexed items |
| GET | `/rss` | RSS 2.0 output |
| GET | `/api/sources` | In-memory source configuration plus database statistics and pull state |
| GET | `/api/sources/stats` | Compatibility endpoint for per-source database statistics |
| GET | `/api/scheduler/stats` | Running, queued, completed, and next-run statistics |
| GET | `/api/logs` | Runtime logs |
| GET | `/api/events` | Feed update SSE stream |

### `/api/feed`

Parameters:

- `limit`: 1-200, default 50.
- `offset`: pagination offset.
- `ref` or `source`: exact configured source ref.
- `since`, `until`: ISO date/time or `YYYY-MM-DD` bounds.
- `lng`: prefer translated item fields for a BCP 47 language key.

Response: `{ sources, items, hasMore }`. Items include database fields plus `sub_id` and `sub_title`.

### `/api/items`

Parameters:

- `q`: SQLite FTS query over title, summary, and content.
- `ref` or `source`: source filter.
- `subscribed=true`: restrict to configured sources.
- `author`: author filter.
- `tags=a,b`: match tags.
- `days=1..365`, or `since`/`until`: time window.
- `limit`: up to 500; `offset`: pagination.
- `lng`: translated view.

Response: `{ items, total, hasMore }`.

### `/rss`

Use `limit`, `offset`, `ref`/`source`, `since`, `until`, and `lng` as supported by the route. Prefer `/api/feed` for agent reasoning and `/rss` for feed readers.

## Source pulling

Submit an immediate pull:

```http
POST /api/tasks
Content-Type: application/json

{"type":"source-pull","ref":"https://example.com/feed"}
```

The response contains `taskId`. Poll `GET /api/tasks/:id` or subscribe to `GET /api/tasks/:id/events`. Manual pulls use a dedicated scheduler lane and default to headless Chrome.

## Management APIs

- Sources: `GET /api/sources`, `GET/PUT /api/sources/raw`, `POST /api/sources/plugin-match`, `POST /api/sources/open-browser`.
- Plugins: `GET/POST /api/plugins`, `GET/PUT/DELETE /api/plugins/:id`.
- Settings: `GET/PUT /api/proxy`, `/api/pipeline`, `/api/tags`, `/api/llm`, `/api/deliver`, `/api/update-settings`.
- Diagnostics: `GET /admin/parse/*`, `GET /admin/extractor/*`, `GET /auth/check`, `POST /auth/open`, `POST /auth/ensure`.

## Destructive endpoints

Require explicit user authorization before calling:

- `DELETE /api/items/:id`
- `DELETE /api/items/by-source`
- `DELETE /api/plugins/:id`
- `DELETE /api/logs`
- `POST /api/admin/browser/close`

Do not infer deletion permission from a request to inspect, diagnose, summarize, or refresh.
