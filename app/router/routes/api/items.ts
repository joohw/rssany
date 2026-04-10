// /api/items、/api/items/pending-push、/api/items/mark-pushed、/api/items/by-source（须在 :id 之前注册）、/api/items/:id

// /api/user/items（JWT 认证用户）



import type { Hono } from "hono";

import { getAllSubscriptionRefs } from "../../../scraper/subscription/index.js";

import { getEffectiveItemFields, type ItemTranslationFields } from "../../../types/feedItem.js";

import { queryItems, getPendingPushItems, markPushed, deleteItem, deleteItemsBySourceUrl } from "../../../db/index.js";

import { requireAdmin } from "../../../auth/middleware.js";



function parseSubscribedFlag(v: string | undefined): boolean {

  return v === "1" || v === "true" || v === "yes";

}



export function registerItemsRoutes(app: Hono): void {

  app.get("/api/items/pending-push", async (c) => {

    const limit = Math.min(Number(c.req.query("limit") ?? 100), 500);

    const items = await getPendingPushItems(limit);

    return c.json({ items, count: items.length });

  });



  app.post("/api/items/mark-pushed", async (c) => {

    try {

      const { ids } = await c.req.json<{ ids?: string[] }>();

      if (!Array.isArray(ids) || ids.length === 0) return c.json({ ok: false, message: "ids 不能为空" }, 400);

      await markPushed(ids);

      return c.json({ ok: true, count: ids.length });

    } catch (err) {

      return c.json({ ok: false, message: err instanceof Error ? err.message : String(err) }, 400);

    }

  });



  /** 清空指定信源（source_url）下所有已入库条目 — 必须早于 /api/items/:id，否则 "by-source" 会被当成 id */

  app.delete("/api/items/by-source", requireAdmin(), async (c) => {

    const sourceUrl = (c.req.query("source_url") ?? "").trim();

    if (!sourceUrl) return c.json({ ok: false, message: "source_url 不能为空" }, 400);

    const deleted = await deleteItemsBySourceUrl(sourceUrl);

    return c.json({ ok: true, deleted });

  });



  app.delete("/api/items/:id", async (c) => {

    const id = decodeURIComponent(c.req.param("id") ?? "").trim();

    if (!id) return c.json({ ok: false, message: "id 不能为空" }, 400);

    const deleted = await deleteItem(id);

    if (!deleted) return c.json({ ok: false, message: "条目不存在或已删除" }, 404);

    return c.json({ ok: true });

  });



  app.get("/api/items", async (c) => {

    const ref = c.req.query("ref") ?? c.req.query("source") ?? undefined;

    const subscribed = parseSubscribedFlag(c.req.query("subscribed"));

    const author = c.req.query("author") ?? undefined;

    const q = c.req.query("q") ?? undefined;

    const tagsParam = c.req.query("tags") ?? undefined;

    const tags = tagsParam ? tagsParam.split(",").map((t) => t.trim()).filter(Boolean) : undefined;

    // days=0 或不传 days 表示不按天数筛选；days=N 表示最近 N 天；since/until 仍可单独传

    const daysParam = c.req.query("days");

    const sinceParam = c.req.query("since") ?? undefined;

    const untilParam = c.req.query("until") ?? undefined;

    let since: Date | undefined;

    let until: Date | undefined;

    const daysNum = daysParam !== undefined && daysParam !== "" ? Number(daysParam) : NaN;

    if (Number.isFinite(daysNum) && daysNum > 0) {

      const n = Math.max(1, Math.min(365, Math.floor(daysNum)));

      const now = new Date();

      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      const todayEnd = new Date(todayStart);

      todayEnd.setDate(todayEnd.getDate() + 1);

      since = new Date(todayStart);

      since.setDate(since.getDate() - (n - 1));

      until = todayEnd;

    } else {

      since = sinceParam ? new Date(sinceParam) : undefined;

      if (untilParam) {

        if (untilParam.length === 10) {

          const d = new Date(untilParam + "T12:00:00Z");

          d.setUTCDate(d.getUTCDate() + 1);

          until = d;

        } else {

          until = new Date(untilParam);

        }

      }

    }

    const limit = Math.min(Number(c.req.query("limit") ?? 200), 500);

    const offset = Number(c.req.query("offset") ?? 0);

    const lng = c.req.query("lng") ?? undefined;



    let sourceUrls: string[] | undefined;

    let effectiveSourceUrl: string | undefined;

    if (ref) {

      effectiveSourceUrl = ref;

      sourceUrls = undefined;

    } else if (subscribed) {

      const refs = await getAllSubscriptionRefs();

      sourceUrls = refs.length > 0 ? refs : [];

    }



    if (!effectiveSourceUrl && sourceUrls?.length === 0) {

      return c.json({ items: [], total: 0, hasMore: false });

    }



    const result = await queryItems({

      sourceUrl: effectiveSourceUrl ?? (sourceUrls ? undefined : ref),

      sourceUrls,

      author,

      q,

      tags,

      since,

      until,

      limit,

      offset,

    });

    const items =

      lng && result.items.length > 0

        ? result.items.map((it) => {

            const view = {

              title: it.title ?? "",

              summary: it.summary ?? "",

              content: it.content ?? "",

              translations: (it as { translations?: Record<string, ItemTranslationFields> }).translations,

            };

            const eff = getEffectiveItemFields(view, lng);

            return { ...it, title: eff.title, summary: eff.summary, content: eff.content };

          })

        : result.items;

    const hasMore = offset + items.length < result.total;

    return c.json({ items, total: result.total, hasMore });

  });

}

