// /api/plugins、POST /api/plugins（从模板新建）、/api/plugins/:id（读写字节码插件源文件）

import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import type { Hono } from "hono";
import { getPluginSites } from "../../../scraper/sources/web/index.js";
import { registeredSources } from "../../../scraper/sources/index.js";
import { getPluginFilePath } from "../../../plugins/loader.js";
import { requireAdmin } from "../../../auth/middleware.js";
import { initSources } from "../../../scraper/sources/index.js";
import { BUILTIN_PLUGINS_DIR, USER_PLUGINS_DIR, PLUGIN_SITE_TEMPLATE_PATH } from "../../../config/paths.js";

const SITE_TEMPLATE_FALLBACK = `/**
 * Site 插件模板（由 /plugins 页添加，位于 .rssany/plugins/）
 * HTML DOM 解析请用 ctx.deps.parseHtml，勿在插件内 import node_modules。
 */
export default {
  id: "__PLUGIN_ID__",
  listUrlPattern: __LIST_URL_PATTERN__,
  refreshInterval: "1day",

  async fetchItems(sourceId, ctx) {
    const { html, finalUrl } = await ctx.fetchHtml(sourceId, {
      waitMs: 2000,
      purify: true,
    });
    void ctx.deps.parseHtml(html);
    void finalUrl;
    return [];
  },
};
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

async function fileExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

function isAllowedPluginPath(absPath: string): boolean {
  const f = resolve(absPath);
  for (const root of [BUILTIN_PLUGINS_DIR, USER_PLUGINS_DIR]) {
    const r = resolve(root);
    if (f === r || f.startsWith(r + sep)) return true;
  }
  return false;
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
    await mkdir(USER_PLUGINS_DIR, { recursive: true });
    const outPath = join(USER_PLUGINS_DIR, `${id}.rssany.js`);
    if (await fileExists(outPath)) return c.json({ error: "该 id 已存在同名文件" }, 409);
    let tpl = SITE_TEMPLATE_FALLBACK;
    try {
      tpl = await readFile(PLUGIN_SITE_TEMPLATE_PATH, "utf-8");
    } catch {
      // 使用内置模板
    }
    const patternLiteral = JSON.stringify(listUrlPatternRaw);
    const content = tpl.replace(/__PLUGIN_ID__/g, id).replace(/__LIST_URL_PATTERN__/g, patternLiteral);
    if (!isAllowedPluginPath(outPath)) return c.json({ error: "路径不允许" }, 403);
    try {
      await writeFile(outPath, content, "utf-8");
      await initSources();
      return c.json({ ok: true, filePath: outPath, id });
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
    }
  });

  app.get("/api/plugins", requireAdmin(), (c) => {
    const sites = getPluginSites().map((s) => ({
      kind: "site" as const,
      id: s.id,
      listUrlPattern: typeof s.listUrlPattern === "string" ? s.listUrlPattern : String(s.listUrlPattern),
      hasAuth: !!(s.checkAuth && s.loginUrl),
    }));
    const siteIds = new Set(sites.map((p) => p.id));
    const sources = registeredSources
      .filter((src) => src.id !== "generic" && !siteIds.has(src.id))
      .map((src) => ({
        kind: "source" as const,
        id: src.id,
        listUrlPattern: typeof src.pattern === "string" ? src.pattern : String(src.pattern),
        hasAuth: false,
      }));
    return c.json([...sites, ...sources]);
  });

  app.get("/api/plugins/:id", requireAdmin(), async (c) => {
    const id = decodeURIComponent(c.req.param("id") ?? "").trim();
    if (!id) return c.json({ error: "缺少 id" }, 400);
    const filePath = getPluginFilePath(id);
    if (!filePath) return c.json({ error: "未找到该插件或无可编辑文件" }, 404);
    if (!isAllowedPluginPath(filePath)) return c.json({ error: "路径不允许" }, 403);
    try {
      const content = await readFile(filePath, "utf-8");
      return c.json({ id, filePath, content });
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
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
    const filePath = getPluginFilePath(id);
    if (!filePath) return c.json({ error: "未找到该插件" }, 404);
    if (!isAllowedPluginPath(filePath)) return c.json({ error: "路径不允许" }, 403);
    try {
      await writeFile(filePath, body.content, "utf-8");
      await initSources();
      return c.json({ ok: true });
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
    }
  });
}
