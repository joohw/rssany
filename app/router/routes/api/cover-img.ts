// GET /api/cover-img?url=… — 代理条目封面图，绕过部分 CDN 防盗链

import type { Hono } from "hono";

const MAX_BYTES = 5 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 12_000;

function isAllowedImageUrl(raw: string): URL | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname) return null;
    return url;
  } catch {
    return null;
  }
}

export function registerCoverImgRoutes(app: Hono): void {
  app.get("/api/cover-img", async (c) => {
    const raw = (c.req.query("url") ?? "").trim();
    if (!raw) return c.text("missing url", 400);

    const url = isAllowedImageUrl(raw);
    if (!url) return c.text("invalid url", 400);

    try {
      const res = await fetch(url.toString(), {
        redirect: "follow",
        headers: {
          Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          Referer: `${url.origin}/`,
        },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!res.ok) return c.text("upstream error", 502);

      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > MAX_BYTES) return c.text("too large", 413);

      const ct = (res.headers.get("content-type") ?? "application/octet-stream").split(";")[0].trim();
      return new Response(buf, {
        headers: {
          "Content-Type": ct,
          "Cache-Control": "public, max-age=86400",
        },
      });
    } catch {
      return c.text("fetch failed", 502);
    }
  });
}
