// /api/deliver、/api/deliver/test — Gateway 基址；固定 POST {gateway}/items、{gateway}/sources，测试 POST {gateway}/test

import type { Hono } from "hono";
import type { FeedItem } from "../../../types/feedItem.js";
import { requireAdmin } from "../../../auth/middleware.js";
import { getDeliverConfig, normalizeDeliverGateways, saveDeliverConfig } from "../../../config/deliver.js";
import { getSourcesRaw } from "../../../scraper/subscription/index.js";
import { feedItemsToPayload, postDeliverGatewayTest } from "../../../deliver/post.js";

type DeliverRequestBody = {
  gateway?: string;
  gateways?: unknown;
  token?: string;
  /** 旧版：完整 …/items URL，将迁移为 gateway 基址 */
  url?: string;
  urls?: unknown;
};

function unknownArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function registerDeliverRoutes(app: Hono): void {
  app.get("/api/deliver", requireAdmin(), async (c) => {
    const { gateway, gateways, token } = await getDeliverConfig();
    return c.json({ gateway, gateways, token });
  });

  app.put("/api/deliver", requireAdmin(), async (c) => {
    try {
      const body = await c.req.json<DeliverRequestBody>();
      const prev = await getDeliverConfig();
      const explicitGateways = body != null && "gateways" in body;
      const explicitGateway = body != null && "gateway" in body;
      const explicitUrl = body != null && "url" in body;
      const explicitUrls = body != null && "urls" in body;
      const explicitToken = body != null && "token" in body;

      const gateways =
        explicitGateways || explicitGateway || explicitUrl || explicitUrls
          ? normalizeDeliverGateways([
              ...unknownArray(body?.gateways),
              body?.gateway,
              ...unknownArray(body?.urls),
              body?.url,
            ])
          : prev.gateways;
      let token = typeof body?.token === "string" ? body.token.trim() : "";
      if (!explicitToken) {
        token = prev.token;
      }
      await saveDeliverConfig({ gateway: gateways[0] ?? "", gateways, token });
      return c.json({ ok: true, gateway: gateways[0] ?? "", gateways, token });
    } catch (err) {
      return c.json({ ok: false, message: err instanceof Error ? err.message : String(err) }, 400);
    }
  });

  /** 合并测试：仅 POST 到 {gateway}/test，体含示例 items 批次与当前 sources 文档 */
  app.post("/api/deliver/test", requireAdmin(), async (c) => {
    try {
      const body = await c.req.json<DeliverRequestBody>();
      const prev = await getDeliverConfig();
      const explicitGateways = body != null && "gateways" in body;
      const explicitGateway = body != null && "gateway" in body;
      const explicitUrl = body != null && "url" in body;
      const explicitUrls = body != null && "urls" in body;
      const gateways =
        explicitGateways || explicitGateway || explicitUrl || explicitUrls
          ? normalizeDeliverGateways([
              ...unknownArray(body?.gateways),
              body?.gateway,
              ...unknownArray(body?.urls),
              body?.url,
            ])
          : prev.gateways;
      const token =
        typeof body?.token === "string" ? body.token.trim() : prev.token;
      if (gateways.length === 0) return c.json({ ok: false, message: "gateway 不能为空" }, 400);

      const now = Date.now();
      const sample: FeedItem = {
        guid: "deliver-test-" + now,
        title: "投递连通性测试",
        link: "https://example.com/rssany-deliver-test",
        pubDate: new Date(),
        summary: "若下游 /test 收到此条，说明 Gateway 可用。",
        sourceRef: "rssany-deliver-test",
      };
      const raw = await getSourcesRaw();
      let sourcesDoc: unknown;
      try {
        sourcesDoc = JSON.parse(raw) as unknown;
      } catch {
        sourcesDoc = { sources: [] };
      }

      const payload = {
        rssanyConnectivityTest: true,
        items: {
          sourceRef: "rssany-deliver-test",
          items: feedItemsToPayload([sample]),
        },
        sources: sourcesDoc,
      };

      const results = await Promise.all(
        gateways.map(async (gateway) => {
          try {
            await postDeliverGatewayTest(gateway, payload, { bearerToken: token || undefined });
            return { gateway, ok: true };
          } catch (err) {
            return {
              gateway,
              ok: false,
              message: err instanceof Error ? err.message : String(err),
            };
          }
        }),
      );
      const failed = results.filter((result) => !result.ok);
      if (failed.length > 0) {
        return c.json({
          ok: false,
          message: `${failed.length}/${gateways.length} 个 Gateway 测试失败`,
          results,
        }, 400);
      }
      return c.json({ ok: true, results });
    } catch (err) {
      return c.json({ ok: false, message: err instanceof Error ? err.message : String(err) }, 400);
    }
  });
}
