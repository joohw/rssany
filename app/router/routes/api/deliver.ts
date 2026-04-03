// /api/deliver、/api/deliver/test — 配置投递 URL；非空则在正常写库后额外 POST 条目到该地址

import type { Hono } from "hono";
import { requireAdmin } from "../../../auth/middleware.js";
import { getDeliverUrl, saveDeliverUrl } from "../../../config/deliver.js";
import { postDeliverItems } from "../../../deliver/post.js";

export function registerDeliverRoutes(app: Hono): void {
  app.get("/api/deliver", requireAdmin(), async (c) => {
    const url = await getDeliverUrl();
    return c.json({ url });
  });

  app.put("/api/deliver", requireAdmin(), async (c) => {
    try {
      const body = await c.req.json<{ url?: string }>();
      const url = typeof body?.url === "string" ? body.url.trim() : "";
      await saveDeliverUrl(url);
      return c.json({ ok: true, url });
    } catch (err) {
      return c.json({ ok: false, message: err instanceof Error ? err.message : String(err) }, 400);
    }
  });

  app.post("/api/deliver/test", requireAdmin(), async (c) => {
    try {
      const body = await c.req.json<{ url?: string }>();
      const url = typeof body?.url === "string" ? body.url.trim() : "";
      if (!url) return c.json({ ok: false, message: "url 不能为空" }, 400);
      const sample = {
        guid: "deliver-test-" + Date.now(),
        title: "投递连通性测试",
        link: "https://example.com/rssany-deliver-test",
        pubDate: new Date().toISOString(),
        summary: "若下游收到此条，说明投递 URL 可用。",
      };
      await postDeliverItems(url, "rssany-deliver-test", [
        {
          guid: sample.guid,
          title: sample.title,
          link: sample.link,
          pubDate: new Date(sample.pubDate),
          summary: sample.summary,
          sourceRef: "rssany-deliver-test",
        },
      ]);
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ ok: false, message: err instanceof Error ? err.message : String(err) }, 400);
    }
  });
}
