/**
 * Site plugin template. The admin UI copies this file to .rssany/plugins/{id}.rssany.js.
 * Plugin protocol: named exports. No export default is required.
 *
 * Interface: app/scraper/sources/web/site.ts
 */

// Predefined fields stay together at the top.
export const id = "__PLUGIN_ID__";
export const name = "__PLUGIN_ID__";
// eslint-disable-next-line no-undef
export const listUrlPattern = __LIST_URL_PATTERN__;
export const refreshInterval = "1day";

export async function fetchItems(sourceId, ctx) {
  const { html, finalUrl } = await ctx.fetchHtml(sourceId, {
    waitMs: 2000,
    purify: true,
  });
  const root = ctx.deps.parseHtml(html);
  void root;
  void finalUrl;
  // TODO: Parse the list page and return FeedItem objects.
  return [];
}
