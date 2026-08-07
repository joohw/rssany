# Local MCP

RssAny exposes one JSON-RPC MCP server over modern Streamable HTTP and legacy HTTP/SSE. For client installation, read [installation.md](installation.md).

## Discovery and transport

- Streamable HTTP: `POST http://127.0.0.1:18473/mcp` (preferred)
- Discovery: `GET http://127.0.0.1:18473/mcp`
- Legacy SSE session: `GET http://127.0.0.1:18473/mcp/sse`
- Client messages: the SSE `endpoint` event supplies `/mcp/messages?sessionId=...`
- Server name: `rssany-local`

Configure a modern URL-based MCP client with the Streamable HTTP endpoint:

```json
{
  "mcpServers": {
    "rssany": {
      "url": "http://127.0.0.1:18473/mcp"
    }
  }
}
```

Use `/mcp/sse` only when a client explicitly requests the legacy SSE transport. It must follow the SSE `endpoint` event to `/mcp/messages?sessionId=...`. Verify `GET /mcp` first when setup fails.

## Access policy

Real HTTP requests are accepted only from loopback by default. `RSSANY_MCP_ALLOW_REMOTE=1` permits remote access, including mutation tools; enable it only with explicit user approval and appropriate network controls.

## Tools

### Read-only

- `list_sources {}`: configured sources and schedule metadata.
- `query_items { q?, source_url?, tags?, author?, since?, until?, limit?, offset? }`: indexed search; limit 1-200.
- `get_item { id }`: one item including full content.
- `get_source_stats {}`: item counts and latest timestamps grouped by source.
- `list_plugins {}`: loaded user plugins.
- `read_plugin { id }`: complete effective plugin source.

### Mutating

- `write_plugin { id, content }`: create/update a plugin, reload immediately, validate, and roll back on failure. Maximum source size is 2 MiB.
- `delete_plugin { id }`: delete a user plugin. Require explicit authorization.

## Agent query workflow

1. Call `list_sources` when the source ref is unknown.
2. Call `query_items` with the narrowest useful filters.
3. Call `get_item` only for selected records that need full content.
4. Verify consequential claims against the original item link.
5. Read a plugin before editing it. Preserve unrelated user code and use `write_plugin` only after validating the full replacement source.
