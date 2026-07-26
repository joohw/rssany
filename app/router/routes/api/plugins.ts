// /api/plugins：列出、创建、读取、保存、删除用户插件目录中的插件。

import { readFile } from "node:fs/promises";
import type { Context, Hono } from "hono";
import { requireAdmin } from "../../../auth/middleware.js";
import { PLUGIN_SITE_TEMPLATE_PATH } from "../../../config/paths.js";
import {
  deleteManagedPlugin,
  listManagedPlugins,
  PluginManagementError,
  readManagedPlugin,
  writeManagedPlugin,
} from "../../../plugins/management.js";

const SITE_TEMPLATE_FALLBACK = `/**
 * Site plugin template created from the /plugins page.
 * Plugin protocol: named exports. No export default is required.
 * Parse HTML with ctx.deps.parseHtml; do not import app dependencies directly.
 */

// Predefined fields stay together at the top.
export const id = "__PLUGIN_ID__";
export const name = "__PLUGIN_ID__";
export const listUrlPattern = __LIST_URL_PATTERN__;
export const refreshInterval = "1day";

export async function fetchItems(sourceId, ctx) {
  const { html, finalUrl } = await ctx.fetchHtml(sourceId, {
    waitMs: 2000,
    purify: true,
  });
  void ctx.deps.parseHtml(html);
  void finalUrl;
  return [];
}
`;

function isValidNewPluginId(id: string): boolean {
  return /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(id) && id !== "generic" && id !== "new";
}

/** 与模板中 `listUrlPattern: __LIST_URL_PATTERN__` 注入一致：非空、无换行、长度上限 */
function isValidNewListUrlPattern(pattern: string): boolean {
  if (pattern.length === 0 || pattern.length > 2048) return false;
  if (/[\r\n]/.test(pattern)) return false;
  return true;
}

function pluginError(c: Context, error: unknown) {
  if (error instanceof PluginManagementError) return c.json({ error: error.message }, error.status);
  return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
}

export function registerPluginsRoutes(app: Hono): void {
  /** 从模板在 .rssany/plugins/{id}.rssany.js 新建 Site 插件 */
  app.post("/api/plugins", requireAdmin(), async (c) => {
    let body: { id?: string; listUrlPattern?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "无效 JSON" }, 400);
    }
    const id = typeof body.id === "string" ? body.id.trim() : "";
    if (!id) return c.json({ error: "缺少 id" }, 400);
    if (!isValidNewPluginId(id)) {
      return c.json({ error: "id 须为字母开头，仅含字母数字、下划线、连字符；不能为 generic 或 new" }, 400);
    }
    const listUrlPatternRaw = typeof body.listUrlPattern === "string" ? body.listUrlPattern.trim() : "";
    if (!listUrlPatternRaw) {
      return c.json({ error: "缺少支持的站点（listUrlPattern），例如 https://example.com/*" }, 400);
    }
    if (!isValidNewListUrlPattern(listUrlPatternRaw)) {
      return c.json({ error: "支持的站点须为非空字符串，不超过 2048 字符，且不能含换行" }, 400);
    }
    let tpl = SITE_TEMPLATE_FALLBACK;
    try {
      tpl = await readFile(PLUGIN_SITE_TEMPLATE_PATH, "utf-8");
    } catch {
      // 使用内置模板
    }
    const patternLiteral = JSON.stringify(listUrlPatternRaw);
    const content = tpl.replace(/__PLUGIN_ID__/g, id).replace(/__LIST_URL_PATTERN__/g, patternLiteral);
    try {
      const plugin = await writeManagedPlugin(id, content, { mustNotExist: true });
      return c.json({ ok: true, ...plugin });
    } catch (error) {
      return pluginError(c, error);
    }
  });

  app.get("/api/plugins", requireAdmin(), (c) => {
    return c.json(listManagedPlugins());
  });

  app.get("/api/plugins/:id", requireAdmin(), async (c) => {
    const id = decodeURIComponent(c.req.param("id") ?? "").trim();
    if (!id) return c.json({ error: "缺少 id" }, 400);
    try {
      return c.json(await readManagedPlugin(id));
    } catch (error) {
      return pluginError(c, error);
    }
  });

  app.put("/api/plugins/:id", requireAdmin(), async (c) => {
    const id = decodeURIComponent(c.req.param("id") ?? "").trim();
    if (!id) return c.json({ error: "缺少 id" }, 400);
    let body: { content?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "无效 JSON" }, 400);
    }
    if (typeof body.content !== "string") return c.json({ error: "需要 content 字符串" }, 400);
    try {
      const plugin = await writeManagedPlugin(id, body.content);
      return c.json({ ok: true, ...plugin });
    } catch (error) {
      return pluginError(c, error);
    }
  });

  app.delete("/api/plugins/:id", requireAdmin(), async (c) => {
    const id = decodeURIComponent(c.req.param("id") ?? "").trim();
    if (!id) return c.json({ error: "缺少 id" }, 400);
    try {
      return c.json(await deleteManagedPlugin(id));
    } catch (error) {
      return pluginError(c, error);
    }
  });
}
