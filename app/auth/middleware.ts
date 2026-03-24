// JWT 认证中间件：验证 cookie 或 Authorization header 中的 token，注入 userId 到 context

import type { Context, Next } from "hono";
import { getCookie } from "hono/cookie";
import { verifyToken } from "./token.js";
import { getUserById } from "../db/users.js";

export const AUTH_COOKIE = "rssany_auth";

/** 与 users.role 一致；在库中把该用户 role 设为 admin 即可授予后台权限 */
export const ADMIN_ROLE = "admin";

/** 要求登录；未认证返回 401 */
export function requireAuth() {
  return async (c: Context, next: Next): Promise<Response | void> => {
    const userId = await extractUserId(c);
    if (!userId) return c.json({ error: "未登录或 token 已过期" }, 401);
    c.set("userId", userId);
    return next();
  };
}

/** 要求已登录且 users.role 为 admin；否则 401 / 403 */
export function requireAdmin() {
  return async (c: Context, next: Next): Promise<Response | void> => {
    const userId = await extractUserId(c);
    if (!userId) return c.json({ error: "未登录或 token 已过期" }, 401);
    const user = await getUserById(userId);
    if (!user) return c.json({ error: "用户不存在" }, 401);
    if (user.role !== ADMIN_ROLE) return c.json({ error: "需要管理员权限" }, 403);
    c.set("userId", userId);
    return next();
  };
}

/** 可选登录；已认证则注入 userId，未认证继续（不拦截） */
export function optionalAuth() {
  return async (c: Context, next: Next): Promise<Response | void> => {
    const userId = await extractUserId(c);
    if (userId) c.set("userId", userId);
    return next();
  };
}

async function extractUserId(c: Context): Promise<string | null> {
  const fromCookie = getCookie(c, AUTH_COOKIE);
  const fromHeader = c.req.header("Authorization")?.replace(/^Bearer\s+/i, "");
  const token = fromCookie ?? fromHeader;
  if (!token) return null;
  try {
    return await verifyToken(token);
  } catch {
    return null;
  }
}

/** 从请求解析当前用户 id，未登录返回 null（供需区分登录态的路由使用） */
export async function getOptionalUserId(c: Context): Promise<string | null> {
  return extractUserId(c);
}
