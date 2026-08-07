# Operations

## CLI

For a global npm installation:

```text
rssany start
rssany status
rssany crawl <sourceRef>
rssany stop
rssany update
```

Running `rssany` without a command starts the managed background service and prints its local URL. Startup waits up to 12 seconds for the health endpoint.

For source development, use the repository npm scripts (`dev`, `dev:backend`, `typecheck`, `test:run`, `build:all`) rather than modifying the global installation in place.

## Health and logs

1. Call `GET /api/server-info`.
2. Check `rssany status` and the managed PID file.
3. Inspect `rssany.log` under the user directory or `GET /api/logs`.
4. Check `/api/scheduler/stats` and `/api/sources/pull-status` for crawl state.

The CLI may report startup incomplete when the process is still initializing; confirm the process and health endpoint before treating it as a crash.

## Backup

Stop the managed service before taking a consistent filesystem backup. Preserve at least:

- `config.json`
- `data/rssany.db`
- `plugins/`

Cache and browser profile directories are optional but may contain authentication cookies. Protect backups accordingly.

## Updating

Published npm releases are produced through the repository GitHub Actions workflow. Before release, update package versions, run tests/build, inspect `npm pack --dry-run`, push the code, trigger the workflow, and verify npm `latest`.

## Runtime behavior

- RSS XML is generated on demand rather than maintained as a permanent static file.
- Items persist in SQLite and are deduplicated by guid/id-related logic.
- Manual pulls run through a dedicated scheduler lane.
- Graceful `SIGINT`/`SIGTERM` shutdown closes browsers owned by the current backend.
- Delivery is outbound only; RssAny does not expose an inbound item gateway.
