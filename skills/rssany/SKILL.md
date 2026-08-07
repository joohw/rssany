---
name: rssany
description: Operate, integrate, extend, and troubleshoot a local RssAny service. Use when an agent needs to read or filter indexed RSS/web/email items, consume JSON or RSS output, connect to the RssAny MCP server, manage configured sources, develop or debug .rssany.js/.rssany.ts source plugins, inspect scheduling and delivery, or diagnose installation, browser, authentication, proxy, cache, and startup problems.
---

# RssAny

Use RssAny as a local subscription pipeline: sources are fetched on schedule, normalized into SQLite items, processed by the fixed pipeline, and exposed through JSON, RSS, and MCP.

## Resolve the service

1. Use the base URL supplied by the user.
2. Otherwise default to `http://127.0.0.1:18473`.
3. Verify availability with `GET /api/server-info` before diagnosing downstream failures.
4. Treat `sourceRef`, `ref`, and source URL as the same source identifier unless an endpoint documents otherwise.

## Route the task

- Read feeds, query items, or integrate HTTP clients: read [references/http-api.md](references/http-api.md).
- Install RssAny, find its official project links, download/install this Skill ZIP, or connect an MCP client: read [references/installation.md](references/installation.md).
- Call MCP tools or inspect their schemas and safety boundaries: read [references/mcp.md](references/mcp.md).
- Create, modify, validate, or debug source plugins: read [references/plugins.md](references/plugins.md).
- Edit sources, refresh schedules, proxy, pipeline, delivery, tags, LLM, or paths: read [references/configuration.md](references/configuration.md).
- Install, start, stop, update, back up, or inspect the service: read [references/operations.md](references/operations.md).
- Diagnose startup, Chrome profile, authentication, parsing, scheduling, or empty-feed problems: read [references/troubleshooting.md](references/troubleshooting.md).
- Change RssAny itself or reason about module ownership and data flow: read [references/architecture.md](references/architecture.md).

## Default workflow

1. Prefer read-only JSON or MCP queries before changing configuration.
2. Filter by source, time, tags, author, and keywords before summarizing.
3. Preserve item title, link, source, publication time, and guid/id in derived results.
4. Open original links for claims that require verification; distinguish indexed text from current page state.
5. If no existing source/plugin matches a target, inspect the page and implement a user plugin rather than patching core routing.
6. Validate a plugin through the management API or MCP write tool so failed reloads roll back.
7. Report mutations and their scope. Never delete items, plugins, logs, or user data without explicit authorization.

## Safety boundaries

- Treat `write_plugin`, `delete_plugin`, source/config writes, item deletion, log deletion, browser closing, reset, and delivery tests as state-changing operations.
- Do not expose IMAP credentials, proxy credentials, LLM keys, cookies, JWTs, or delivery tokens.
- Keep runtime data under the configured RssAny user directory; do not edit npm package seed plugins to change a running installation.
- MCP is local-only by default. Do not enable remote access unless the user explicitly accepts the security implications.
