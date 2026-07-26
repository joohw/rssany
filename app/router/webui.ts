// 生产环境：在同一端口托管 React/Vite 静态构建。

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { serveStatic } from "@hono/node-server/serve-static";
import type { Context, Hono } from "hono";
import { PACKAGE_ROOT } from "../packageRoot.js";
import { isInitialized } from "../config/configFile.js";

/** WebUI 构建目录；可用 WEBUI_BUILD_DIR 覆盖。 */
export function getWebUiBuildDir(): string {
  const w = process.env.WEBUI_BUILD_DIR?.trim();
  if (w) {
    if (w.startsWith("/") || /^[A-Za-z]:[\\/]/.test(w)) return w;
    return join(process.cwd(), w);
  }
  return join(PACKAGE_ROOT, "app/webui-react/dist");
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
  const entryFile = "index.html";
  if (!existsSync(absRoot)) {
    console.warn(
      "未找到 WebUI 构建目录，静态路由已注册，等待前端 watch 构建:",
      absRoot,
      "（开发模式：npm run dev；单独构建：npm run webui:react:build）",
    );
  }

  const relRoot = relative(process.cwd(), absRoot).replace(/\\/g, "/");
  const staticRoot =
    relRoot === "" || relRoot === "."
      ? "."
      : relRoot.startsWith(".") || relRoot.startsWith("/") || /^[A-Za-z]:/.test(relRoot)
        ? relRoot
        : `./${relRoot}`;

  const staticMw = serveStatic({
    root: staticRoot,
    index: entryFile,
  });

  app.use("*", async (c, next) => {
    if (isBackendOnlyPath(c.req.path)) return next();
    if (
      c.req.method === "GET"
      && c.req.path !== "/init"
      && !looksLikeStaticAsset(c.req.path)
      && !(await isInitialized())
    ) {
      return c.redirect("/init");
    }
    return staticMw(c, next);
  });

  const spaFallback = async (c: Context) => {
    const p = c.req.path;
    if (isBackendOnlyPath(p)) return c.notFound();
    if (looksLikeStaticAsset(p)) return c.notFound();
    try {
      const html = await readFile(join(absRoot, entryFile), "utf-8");
      return c.html(html);
    } catch {
      return c.notFound();
    }
  };

  app.get("*", spaFallback);
}
