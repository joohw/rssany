// /api/feed、/api/events

import type { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { onFeedUpdated } from "../../../core/events/index.js";
import { getAllSources, getAllSubscriptionRefs, resolveRef } from "../../../scraper/subscription/index.js";
import { getEffectiveItemFields, type ItemTranslationFields } from "../../../types/feedItem.js";
import { queryFeedItems } from "../../../db/index.js";

export function registerFeedRoutes(app: Hono): void {
  app.get("/api/feed", async (c) => {
    const limit = Math.min(Number(c.req.query("limit") ?? 50), 200);
    const offset = Number(c.req.query("offset") ?? 0);
    const refFilter = c.req.query("ref") ?? c.req.query("source") ?? undefined;
    const lng = c.req.query("lng") ?? undefined;
    const since = c.req.query("since");
    const until = c.req.query("until");

    const sources = await getAllSources();
    const refSet = new Set(sources.map((s) => resolveRef(s)).filter(Boolean));
    let sourceRefs: string[];
    if (refFilter) {
      sourceRefs = refSet.has(refFilter) ? [refFilter] : [];
    } else {
      sourceRefs = await getAllSubscriptionRefs();
    }

    const labelByRef = new Map(sources.map((s) => [resolveRef(s), s.label ?? resolveRef(s)] as const));
    const sourcesMeta = sources.map((s) => ({
      ref: resolveRef(s),
      label: s.label ?? resolveRef(s),
    }));

    const dateOpts = since || until ? { since: since ?? undefined, until: until ?? undefined } : undefined;
    const { items: dbItems, hasMore } = await queryFeedItems(sourceRefs, limit, offset, dateOpts);
    const items = dbItems.map((item) => {
      const refKey = item.source_url ?? "";
      const base = {
        ...item,
        sub_id: refKey,
        sub_title: labelByRef.get(refKey) ?? "",
      };
      if (!lng) return base;
      const view = {
        title: item.title ?? "",
        summary: item.summary ?? "",
        content: item.content ?? "",
        translations: (item as { translations?: Record<string, ItemTranslationFields> }).translations,
      };
      const eff = getEffectiveItemFields(view, lng);
      return { ...base, title: eff.title, summary: eff.summary, content: eff.content };
    });
    return c.json({ sources: sourcesMeta, items, hasMore });
  });

  app.get("/api/events", (c) => {
    return streamSSE(c, async (stream) => {
      await stream.writeSSE({ data: JSON.stringify({ type: "connected" }) });
      const off = onFeedUpdated((e) => {
        stream.writeSSE({ data: JSON.stringify({ type: "feed:updated", sourceUrl: e.sourceUrl, newCount: e.newCount }) }).catch(() => {});
      });
      const heartbeat = setInterval(() => {
        stream.writeSSE({ data: "", event: "ping" }).catch(() => {});
      }, 25000);
      stream.onAbort(() => {
        off();
        clearInterval(heartbeat);
      });
      await new Promise<void>((resolve) => stream.onAbort(resolve));
    });
  });
}
