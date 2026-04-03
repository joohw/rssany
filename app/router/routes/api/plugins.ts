// /api/plugins、POST /api/plugins（从模板新建）、/api/plugins/:id（读写字节码插件源文件）

import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import type { Hono } from "hono";
import { getPluginSites } from "../../../scraper/sources/web/index.js";
import { registeredSources } from "../../../scraper/sources/index.js";
import { getPluginFilePath } from "../../../plugins/loader.js";
import { requireAdmin } from "../../../auth/middleware.js";
import { initSources } from "../../../scraper/sources/index.js";
import { BUILTIN_PLUGINS_DIR, USER_PLUGINS_DIR, USER_SOURCES_DIR } from "../../../config/paths.js";

const USER_SITE_TEMPLATE = join(BUILTIN_PLUGINS_DIR, "templates", "site.rssany.js");

const SITE_TEMPLATE_FALLBACK = `/**
 * Site 插件模板（由管理页添加，位于 .rssany/plugins/sources/）
 */
export default {
  id: "__PLUGIN_ID__",
  listUrlPattern: "https://example.com/{segment}",
  refreshInterval: "1day",

  async fetchItems(sourceId, ctx) {
    const { html, finalUrl } = await ctx.fetchHtml(sourceId, {
      waitMs: 2000,
      purify: true,
    });
    void html;
    void finalUrl;
    return [];
  },
};
`;

function isValidNewPluginId(id: string): boolean {
  return /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(id) && id !== "generic" && id !== "new";
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
  /** 从模板在 .rssany/plugins/sources/{id}.rssany.ts 新建 Site 插件 */
  app.post("/api/plugins", requireAdmin(), async (c) => {
    let body: { id?: string };
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
    await mkdir(USER_PLUGINS_DIR, { recursive: true });
    await mkdir(USER_SOURCES_DIR, { recursive: true });
    const outPath = join(USER_SOURCES_DIR, `${id}.rssany.ts`);
    if (await fileExists(outPath)) return c.json({ error: "该 id 已存在同名文件" }, 409);
    let tpl = SITE_TEMPLATE_FALLBACK;
    try {
      tpl = await readFile(USER_SITE_TEMPLATE, "utf-8");
    } catch {
      // 使用内置模板
    }
    const content = tpl.replace(/__PLUGIN_ID__/g, id);
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
      hasEnrich: !!s.enrichItem,
      hasAuth: !!(s.checkAuth && s.loginUrl),
    }));
    const siteIds = new Set(sites.map((p) => p.id));
    const sources = registeredSources
      .filter((src) => src.id !== "generic" && !siteIds.has(src.id))
      .map((src) => ({
        kind: "source" as const,
        id: src.id,
        listUrlPattern: typeof src.pattern === "string" ? src.pattern : String(src.pattern),
        hasEnrich: !!src.enrichItem,
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
