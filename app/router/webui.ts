// 生产环境：在同一端口托管 SvelteKit 静态构建（adapter-static + 200.html SPA fallback）

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { serveStatic } from "@hono/node-server/serve-static";
import type { Context, Hono } from "hono";

/** 与 svelte.config.js 中 adapter-static 的 pages/assets 输出目录一致 */
export function getWebUiBuildDir(): string {
  return join(process.cwd(), process.env.WEBUI_BUILD_DIR ?? "webui/build");
}

/** 仅后端接口路径，不走静态/SPA；注意 /admin 为前端路由，仅 /admin/parse、/admin/extractor 为后端 */
function isBackendOnlyPath(pathname: string): boolean {
  if (pathname.startsWith("/api")) return true;
  if (pathname.startsWith("/rss")) return true;
  if (pathname.startsWith("/auth")) return true;
  if (pathname.startsWith("/admin/parse") || pathname.startsWith("/admin/extractor")) return true;
  return false;
}

/** 明显是静态资源路径但磁盘上无对应文件时，不应返回 200.html */
function looksLikeStaticAsset(pathname: string): boolean {
  return /\.[a-zA-Z0-9]{1,12}$/.test(pathname);
}

/**
 * 在已注册全部 API 路由之后调用。
 * `serveStatic` 的 root 需为相对 cwd 的路径（见 @hono/node-server/serve-static）。
 */
export function registerWebUiRoutes(app: Hono): void {
  const absRoot = getWebUiBuildDir();
  if (!existsSync(absRoot)) {
    console.warn(
      "未找到 WebUI 构建目录，跳过根路径静态托管:",
      absRoot,
      "（构建前端：pnpm run webui:build）",
    );
    return;
  }

  const relRoot = join(process.env.WEBUI_BUILD_DIR ?? "webui/build").replace(/\\/g, "/");
  const staticRoot = relRoot.startsWith(".") ? relRoot : `./${relRoot}`;

  const staticMw = serveStatic({
    root: staticRoot,
    index: "200.html",
  });

  app.use("*", async (c, next) => {
    if (isBackendOnlyPath(c.req.path)) return next();
    return staticMw(c, next);
  });

  const spaFallback = async (c: Context) => {
    const p = c.req.path;
    if (isBackendOnlyPath(p)) return c.notFound();
    if (looksLikeStaticAsset(p)) return c.notFound();
    try {
      const html = await readFile(join(absRoot, "200.html"), "utf-8");
      return c.html(html);
    } catch {
      return c.notFound();
    }
  };

  app.get("*", spaFallback);
}
