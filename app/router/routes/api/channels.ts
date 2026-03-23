// /api/channels、/api/channels/raw、/api/channels/:channelId/feeds（admin）
// /api/user/channels（JWT 认证用户）

import { readFile, writeFile } from "node:fs/promises";
import type { Hono } from "hono";
import { CHANNELS_CONFIG_PATH } from "../../../config/paths.js";
import { getAllChannelConfigs, collectAllSourceRefs } from "../../../core/channel/index.js";
import { getEffectiveItemFields, type ItemTranslationFields } from "../../../types/feedItem.js";
import { queryFeedItems } from "../../../db/index.js";
import { requireAuth } from "../../../auth/middleware.js";
import { getUserChannels, setUserChannels, upsertUserChannel, deleteUserChannel } from "../../../db/userChannels.js";
import { getUserSourceRefs } from "../../../db/userSources.js";

export function registerChannelsRoutes(app: Hono): void {
  app.get("/api/channels", async (c) => {
    const channels = await getAllChannelConfigs();
    const list = channels.map((ch) => ({
      id: ch.id,
      title: ch.title ?? ch.id,
      description: ch.description ?? "",
    }));
    return c.json(list);
  });

  app.get("/api/channels/raw", async (c) => {
    try {
      const raw = await readFile(CHANNELS_CONFIG_PATH, "utf-8");
      return c.text(raw, 200, { "Content-Type": "application/json; charset=utf-8" });
    } catch {
      return c.text("{}", 200, { "Content-Type": "application/json; charset=utf-8" });
    }
  });

  app.put("/api/channels/raw", async (c) => {
    try {
      const raw = await c.req.text();
      JSON.parse(raw);
      await writeFile(CHANNELS_CONFIG_PATH, raw, "utf-8");
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ ok: false, message: err instanceof Error ? err.message : String(err) }, 400);
    }
  });

  app.get("/api/channels/:channelId/feeds", async (c) => {
    const channelId = c.req.param("channelId");
    const limit = Math.min(Number(c.req.query("limit") ?? 50), 200);
    const offset = Number(c.req.query("offset") ?? 0);
    const lng = c.req.query("lng") ?? undefined;
    const since = c.req.query("since");
    const until = c.req.query("until");
    const channels = await getAllChannelConfigs();
    const sourceMap = new Map<string, { subId: string; subTitle: string }>();
    for (const ch of channels) {
      const title = ch.title ?? ch.id;
      for (const ref of ch.sourceRefs || []) {
        if (ref) sourceMap.set(ref, { subId: ch.id, subTitle: title });
      }
    }
    let sourceRefs: string[];
    if (channelId === "all" || !channelId) {
      sourceRefs = collectAllSourceRefs(channels);
    } else {
      const ch = channels.find((x) => x.id === channelId);
      sourceRefs = ch?.sourceRefs ?? [];
    }
    const dateOpts = (since || until) ? { since: since ?? undefined, until: until ?? undefined } : undefined;
    const { items: dbItems, hasMore } = await queryFeedItems(sourceRefs, limit, offset, dateOpts);
    const items = dbItems.map((item) => {
      const base = {
        ...item,
        sub_id: sourceMap.get(item.source_url)?.subId ?? "",
        sub_title: sourceMap.get(item.source_url)?.subTitle ?? "",
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
    return c.json({ items, hasMore });
  });

  // ─── 用户级频道（JWT 认证）───────────────────────────────────────────────────

  app.get("/api/user/channels", requireAuth(), async (c) => {
    const userId = c.get("userId") as string;
    const channels = await getUserChannels(userId);
    return c.json(channels);
  });

  app.put("/api/user/channels", requireAuth(), async (c) => {
    const userId = c.get("userId") as string;
    try {
      const body = await c.req.json<{ channels?: Array<{ id: string; title?: string; description?: string; sourceRefs?: string[] }> }>();
      const channels = Array.isArray(body?.channels) ? body.channels : [];
      await setUserChannels(userId, channels);
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ ok: false, message: err instanceof Error ? err.message : String(err) }, 400);
    }
  });

  app.put("/api/user/channels/:channelId", requireAuth(), async (c) => {
    const userId = c.get("userId") as string;
    const channelId = c.req.param("channelId");
    try {
      const body = await c.req.json<{ title?: string; description?: string; sourceRefs?: string[] }>();
      await upsertUserChannel(userId, { id: channelId, ...body });
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ ok: false, message: err instanceof Error ? err.message : String(err) }, 400);
    }
  });

  app.delete("/api/user/channels/:channelId", requireAuth(), async (c) => {
    const userId = c.get("userId") as string;
    const channelId = c.req.param("channelId");
    await deleteUserChannel(userId, channelId);
    return c.json({ ok: true });
  });

  /** 用户频道的条目列表，按用户自己的信源订阅过滤 */
  app.get("/api/user/channels/:channelId/feeds", requireAuth(), async (c) => {
    const userId = c.get("userId") as string;
    const channelId = c.req.param("channelId");
    const limit = Math.min(Number(c.req.query("limit") ?? 50), 200);
    const offset = Number(c.req.query("offset") ?? 0);
    const lng = c.req.query("lng") ?? undefined;
    const since = c.req.query("since");
    const until = c.req.query("until");

    const channels = await getUserChannels(userId);
    let sourceRefs: string[];
    if (channelId === "all") {
      sourceRefs = await getUserSourceRefs(userId);
    } else {
      const ch = channels.find((x) => x.id === channelId);
      sourceRefs = ch?.sourceRefs ?? [];
    }

    const dateOpts = (since || until) ? { since: since ?? undefined, until: until ?? undefined } : undefined;
    const { items: dbItems, hasMore } = await queryFeedItems(sourceRefs, limit, offset, dateOpts);

    const sourceMap = new Map<string, { subId: string; subTitle: string }>();
    for (const ch of channels) {
      for (const ref of ch.sourceRefs ?? []) {
        sourceMap.set(ref, { subId: ch.id, subTitle: ch.title ?? ch.id });
      }
    }

    const items = dbItems.map((item) => {
      const base = { ...item, sub_id: sourceMap.get(item.source_url)?.subId ?? "", sub_title: sourceMap.get(item.source_url)?.subTitle ?? "" };
      if (!lng) return base;
      const view = { title: item.title ?? "", summary: item.summary ?? "", content: item.content ?? "", translations: (item as { translations?: Record<string, ItemTranslationFields> }).translations };
      const eff = getEffectiveItemFields(view, lng);
      return { ...base, title: eff.title, summary: eff.summary, content: eff.content };
    });
    return c.json({ items, hasMore });
  });
}
