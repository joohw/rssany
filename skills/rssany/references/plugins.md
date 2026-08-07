# Source Plugins

Runtime plugins live only in the user plugin directory as flat `*.rssany.js` or `*.rssany.ts` files. Package files under `app/plugins/builtin/` are initialization seeds, not the live runtime directory.

## Choose a plugin type

- Site plugin: match a website/list URL with `listUrlPattern`; fetch list pages and optional detail pages.
- Source plugin: match a protocol or broad ref pattern with `pattern`; implement a non-web source such as RSS, email, or a custom API scheme.
- Do not implement fixed pipeline stages as user plugins. Tagging, translation, and quality filtering belong to `app/pipeline/`.

## Minimal Site plugin

```js
export const id = "example-news";
export const name = "Example News";
export const listUrlPattern = /^https:\/\/example\.com\/news(?:\/|$)/;
export const refreshInterval = "1h";

export async function fetchItems(sourceId, ctx) {
  const { html, finalUrl } = await ctx.fetchHtml(sourceId, { waitMs: 1500 });
  // Parse html and return normalized items.
  return [{
    guid: `${finalUrl}#first-item`,
    title: "Example title",
    link: `${new URL(finalUrl).origin}/article/1`,
    summary: "Example summary",
    pubDate: new Date().toISOString(),
  }];
}
```

Use stable guid values and absolute links. Return an array of normalized feed items. Typical fields are `guid`, `title`, `link`, `summary`, `content`, `author`, `imageUrl`, `pubDate`, and `tags`.

## Context capabilities

- `ctx.fetchHtml(url, options?)`: browser-backed HTML fetch with cookies, proxy, purification, waits, scrolling, and response metadata.
- `ctx.extractItem(item, extractorConfig?)`: extract detail-page content when needed.
- `ctx.proxy`: effective proxy for the source.

Prefer direct `fetch()` for stable public JSON APIs. Use `ctx.fetchHtml` when rendering, cookies, proxy integration, or authentication is required.

## Scheduling metadata

Supported refresh values include `10min`, `30min`, `1h`, `6h`, `12h`, `1day`, `3day`, and `7day`. A source-level `cron` overrides `refresh`; source configuration overrides plugin defaults.

## Authentication and proxy

Declare the site's authentication flow only when login is required. Let RssAny manage persistent cookies under the cache directory. Do not embed credentials in plugin source. Effective proxy priority is source config, plugin declaration, global proxy, then relevant environment variables.

## Development workflow

1. Call `/api/sources/plugin-match` for the target ref.
2. Inspect a similar built-in or user plugin.
3. Fetch and inspect the actual page/API; avoid guessing selectors or response schemas.
4. Implement complete ESM source with a stable exported `id` and `fetchItems`.
5. Write through `PUT /api/plugins/:id` or MCP `write_plugin`; runtime validation reloads it and rolls back failures.
6. Trigger a manual source pull and inspect task status, logs, and resulting items.
7. Test empty lists, redirects, duplicate guids, missing dates, and authentication failures.

Never delete or overwrite an unrelated user plugin. Read the effective source before updating it.
