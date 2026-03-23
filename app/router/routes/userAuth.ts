// 用户认证路由：邮箱密码注册/登录 + Google/GitHub OAuth + me + logout
// 注意：本文件与 auth.ts（Puppeteer 站点登录）不同，挂载在 /api/auth/*

import type { Hono } from "hono";
import { setCookie, deleteCookie } from "hono/cookie";
import { googleAuth } from "@hono/oauth-providers/google";
import { githubAuth } from "@hono/oauth-providers/github";
import { hashPassword, verifyPassword, signToken } from "../../auth/token.js";
import { requireAuth, AUTH_COOKIE } from "../../auth/middleware.js";
import {
  createUser,
  getUserByEmail,
  getUserById,
  upsertOAuthUser,
  updateUserLastLogin,
  regenerateRssToken,
  toPublicUser,
} from "../../db/users.js";

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "Lax" as const,
  maxAge: 60 * 60 * 24 * 7, // 7 days
  path: "/",
};

function getAppUrl(): string {
  return (process.env.APP_URL ?? "http://localhost:3751").replace(/\/$/, "");
}

export function registerUserAuthRoutes(app: Hono): void {
  // --- 邮箱密码注册 ---
  app.post("/api/auth/register", async (c) => {
    try {
      const { email, password, displayName } = await c.req.json<{ email?: string; password?: string; displayName?: string }>();
      if (!email || !password) return c.json({ error: "email 和 password 不能为空" }, 400);
      if (password.length < 8) return c.json({ error: "密码至少 8 位" }, 400);
      const existing = await getUserByEmail(email);
      if (existing) return c.json({ error: "该邮箱已注册" }, 409);
      const passwordHash = await hashPassword(password);
      const user = await createUser({ email, passwordHash, displayName: displayName ?? null });
      const token = await signToken(user.id);
      setCookie(c, AUTH_COOKIE, token, COOKIE_OPTIONS);
      return c.json({ user: toPublicUser(user), token });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "注册失败" }, 500);
    }
  });

  // --- 邮箱密码登录 ---
  app.post("/api/auth/login", async (c) => {
    try {
      const { email, password } = await c.req.json<{ email?: string; password?: string }>();
      if (!email || !password) return c.json({ error: "email 和 password 不能为空" }, 400);
      const user = await getUserByEmail(email);
      if (!user || !user.password_hash) return c.json({ error: "邮箱或密码错误" }, 401);
      const ok = await verifyPassword(password, user.password_hash);
      if (!ok) return c.json({ error: "邮箱或密码错误" }, 401);
      await updateUserLastLogin(user.id);
      const token = await signToken(user.id);
      setCookie(c, AUTH_COOKIE, token, COOKIE_OPTIONS);
      return c.json({ user: toPublicUser(user), token });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "登录失败" }, 500);
    }
  });

  // --- Google OAuth ---
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    app.use(
      "/api/auth/google",
      googleAuth({
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        scope: ["openid", "profile", "email"],
      })
    );
    app.get("/api/auth/google", async (c) => {
      try {
        const googleUser = c.get("user-google") as { email?: string; name?: string; picture?: string; sub?: string } | undefined;
        if (!googleUser?.email) return c.json({ error: "Google 未返回邮箱信息" }, 400);
        const user = await upsertOAuthUser({
          email: googleUser.email,
          provider: "google",
          providerId: googleUser.sub ?? googleUser.email,
          displayName: googleUser.name ?? null,
          avatarUrl: googleUser.picture ?? null,
        });
        const token = await signToken(user.id);
        setCookie(c, AUTH_COOKIE, token, COOKIE_OPTIONS);
        return c.redirect(`${getAppUrl()}/?auth=ok`);
      } catch (err) {
        return c.redirect(`${getAppUrl()}/?auth=error&msg=${encodeURIComponent(err instanceof Error ? err.message : "oauth failed")}`);
      }
    });
  }

  // --- GitHub OAuth ---
  if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
    app.use(
      "/api/auth/github",
      githubAuth({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
      })
    );
    app.get("/api/auth/github", async (c) => {
      try {
        const githubUser = c.get("user-github") as { email?: string; login?: string; name?: string; avatar_url?: string; id?: number } | undefined;
        const email = githubUser?.email;
        if (!email) return c.redirect(`${getAppUrl()}/?auth=error&msg=github_no_email`);
        const user = await upsertOAuthUser({
          email,
          provider: "github",
          providerId: String(githubUser?.id ?? githubUser?.login ?? email),
          displayName: githubUser?.name ?? githubUser?.login ?? null,
          avatarUrl: githubUser?.avatar_url ?? null,
        });
        const token = await signToken(user.id);
        setCookie(c, AUTH_COOKIE, token, COOKIE_OPTIONS);
        return c.redirect(`${getAppUrl()}/?auth=ok`);
      } catch (err) {
        return c.redirect(`${getAppUrl()}/?auth=error&msg=${encodeURIComponent(err instanceof Error ? err.message : "oauth failed")}`);
      }
    });
  }

  // --- 当前用户信息 ---
  app.get("/api/auth/me", requireAuth(), async (c) => {
    const userId = c.get("userId") as string;
    const user = await getUserById(userId);
    if (!user) return c.json({ error: "用户不存在" }, 404);
    return c.json({ user: toPublicUser(user) });
  });

  // --- 重新生成 RSS Token ---
  app.post("/api/auth/rss-token", requireAuth(), async (c) => {
    const userId = c.get("userId") as string;
    const newToken = await regenerateRssToken(userId);
    return c.json({ rssToken: newToken });
  });

  // --- 登出 ---
  app.post("/api/auth/logout", (c) => {
    deleteCookie(c, AUTH_COOKIE, { path: "/" });
    return c.json({ ok: true });
  });
}
