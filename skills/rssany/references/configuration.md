# Configuration

RssAny stores its unified runtime configuration in `config.json` under the user directory. Use the Web UI or APIs when possible so validation and reload behavior are preserved.

## User and cache directories

- Global npm installation: `{npm prefix}/var/rssany`.
- Source/development run: repository `.rssany/` unless overridden.
- `RSSANY_USER_DIR`: override the user data root.
- `CACHE_DIR`: override cache storage, including Chrome profiles.
- Database: `data/rssany.db`.
- User plugins: `plugins/`.
- Browser/fetch cache: `cache/`.

Parallel RssAny instances must use different user/cache directories unless they intentionally share the same local service resources.

## Sources

Each source supports:

```json
{
  "ref": "https://example.com/feed",
  "type": "rss",
  "label": "Example",
  "description": "Optional description",
  "refresh": "1h",
  "cron": "0 * * * *",
  "proxy": "http://127.0.0.1:7890",
  "weight": 0
}
```

`cron` takes precedence over `refresh`. Omit `type` when automatic matching is sufficient. Avoid placing secrets in source refs when a safer credential mechanism exists.

## Other sections

- `pipeline.steps`: fixed built-in steps such as tagging or translation, represented as `{ id, enabled }`.
- `deliver`: configured gateways/token; configured destinations receive outbound items after persistence and pipeline processing.
- `llm`: optional provider/model/key settings used by extraction and pipeline features.
- `tags`: system tag definitions.
- proxy settings: global fallback proxy; source and plugin values may override it.
- update settings: automatic update/restart preferences.

## Environment variables

- `PORT`: HTTP port, default 18473.
- `RSSANY_USER_DIR`: user data root.
- `CACHE_DIR`: cache root.
- `CHROME_PATH` or `CHROMIUM_PATH`: browser executable.
- `RSSANY_SOURCES_CONCURRENCY`: scheduled-source concurrency, clamped to 1-12.
- `RSSANY_MCP_ALLOW_REMOTE=1`: allow non-loopback MCP access.
- Standard proxy environment variables may be used as fallback.

Do not print configuration sections that may contain credentials. Redact passwords, tokens, API keys, and proxy authentication.
