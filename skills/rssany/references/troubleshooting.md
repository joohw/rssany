# Troubleshooting

## Startup reports incomplete

Check the log, PID, and `GET /api/server-info`. Initialization loads the user directory, database, plugins, and scheduler before listening. A healthy process that becomes reachable shortly after the CLI timeout is a readiness-delay warning, not a crash.

## Chrome profile is already in use

RssAny stores Chrome profiles under `CACHE_DIR/browser_data/`. Scheduled and manual headless requests reuse a shared browser. A compatible existing headless Chrome can be reconnected through `DevToolsActivePort`.

If an explicit headed browser is required while another process owns the profile, do not kill unknown Chrome processes automatically. Close the owning RssAny/Chrome instance or give parallel instances different `CACHE_DIR` values.

## Empty feed or no new items

1. Confirm the source exists in `list_sources` or `/api/sources/raw`.
2. Check plugin matching.
3. Trigger a manual pull and poll its task.
4. Inspect logs and source pull status.
5. Check date filters, source ref canonicalization, guid duplication, and pipeline drops.
6. Test the target page/API independently for layout, redirects, blocks, or authentication changes.

## Authentication required

Use `/auth/check`, then `/auth/open` or `/auth/ensure`. Complete login in the RssAny-managed browser. Do not copy cookies or credentials into chat, logs, or plugin source.

## Parser or extractor failure

Use `/admin/parse/<url>` for list parsing and `/admin/extractor/<url>` for detail extraction. Compare purified and raw HTML when a plugin supports the option. Prefer stable structured APIs over brittle selectors.

## Scheduler warnings or delays

Inspect `/api/scheduler/stats`. Manual pulls are independent of saturated scheduled-source concurrency, but currently running work is not force-terminated. Repeated `node-cron` missed-execution warnings indicate event-loop blocking, machine suspension, or sustained CPU/blocking I/O.

## MCP connection failure

1. Verify `/api/server-info` and `/mcp`.
2. Use `/mcp/sse`, not `/mcp`, as the SSE client URL.
3. Ensure the client follows the SSE endpoint event for message posts.
4. Confirm the request originates from loopback unless remote MCP was explicitly enabled.

## Plugin write fails

Check that filename/id and exported `id` agree, the module is ESM, matching metadata is valid, `fetchItems` is exported, and source size is at most 2 MiB. Management writes validate by loading the module and roll back on failure.
