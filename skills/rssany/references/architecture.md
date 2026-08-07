# Architecture

## Product boundary

RssAny is a self-hosted subscription pipeline, not a research agent. It converts web lists, RSS/Atom, email, APIs, and custom plugin refs into a unified local item store, then exposes JSON, RSS, and optional MCP access.

## Data flow

```text
source ref
  -> getSource / plugin match
  -> authentication pre-check
  -> fetchItems
  -> SQLite upsert and deduplication
  -> fixed per-item pipeline
  -> content update and feed event
  -> optional outbound delivery
  -> JSON / RSS / MCP queries
```

## Module ownership

- `app/core/`: cache helpers, events, logs, and LLM wrappers.
- `app/feeder/`: crawl orchestration, persistence, pipeline invocation, RSS building.
- `app/scraper/`: source matching, plugin contexts, authentication, subscriptions, and source scheduling.
- `app/scheduler/`: generic cron, retries, grouped concurrency, and priority queues.
- `app/db/`: SQLite schema and queries.
- `app/pipeline/`: fixed built-in item processing; not user plugins.
- `app/plugins/builtin/`: first-run plugin seeds.
- user `plugins/`: the only runtime plugin directory.
- `app/mcp/`: MCP tool definitions and JSON-RPC handling.
- `app/router/`: HTTP, RSS, auth, admin diagnostics, API, and MCP transport.

## Persistent state

- Unified config: user `config.json`.
- Items and runtime data: SQLite `data/rssany.db`.
- Fetch and browser state: `cache/`.
- User-owned plugin source: `plugins/`.

Built-in plugins are copied only during first initialization. Later package upgrades do not overwrite modified user copies or restore deleted user plugins.

## Development rules

- Treat code as the source of truth when documentation differs.
- Add source-specific behavior as a user/built-in source plugin, not a special route.
- Keep pipeline stages in `app/pipeline/`.
- Avoid compatibility fallbacks and migration scripts unless explicitly required.
- Preserve unrelated dirty-worktree changes.
- Verify changes with proportional tests, type checking, production builds, and package-content inspection.
