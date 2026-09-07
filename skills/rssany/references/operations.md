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

Running `rssany` without a command starts the managed background service. The CLI checks readiness for about 3 seconds, then prints the local URL if ready or reports that startup is continuing in the background. Use `rssany status` to distinguish a ready service from a live process that is still starting or unavailable. A process that exits during the check is reported immediately as a startup failure.

For source development, use the repository npm scripts (`dev`, `dev:backend`, `typecheck`, `test:run`, `build:all`) rather than modifying the global installation in place.

## Health and logs

1. Call `GET /api/server-info`.
2. Check `rssany status` and the managed PID file.
3. Inspect `rssany.log` under the user directory or `GET /api/logs`.
4. Check `/api/scheduler/stats` and `/api/sources/pull-status` for crawl state.

The startup log records initialization stages and elapsed times. Background startup is not itself a failure; confirm readiness with `rssany status` or the health endpoint. Older CLI versions may instead report startup incomplete after a 12-second readiness timeout.

## Backup

Stop the managed service before taking a consistent filesystem backup. Preserve at least:

- `config.json`
- `data/rssany.db`
- `collectors/`

Cache and browser profile directories are optional but may contain authentication cookies. Protect backups accordingly.

## Updating

Published npm releases are produced through the repository GitHub Actions workflow. Before release, update package versions, run tests/build, inspect `npm pack --dry-run`, push the code, trigger the workflow, and verify npm `latest`.

## Runtime behavior

- RSS XML is generated on demand rather than maintained as a permanent static file.
- Items persist in SQLite and are deduplicated by guid/id-related logic.
- Manual pulls run through a dedicated scheduler lane.
- Graceful `SIGINT`/`SIGTERM` shutdown closes browsers owned by the current backend.
- Delivery is outbound only; RssAny does not expose an inbound item gateway.
