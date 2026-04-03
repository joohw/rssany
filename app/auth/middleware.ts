// 本地运行：管理 API 不做令牌校验（原 admin-token 逻辑已移除）

import type { Context, Next } from "hono";

/** 占位中间件，与既有路由注册兼容，始终放行 */
export function requireAdmin() {
  return async (_c: Context, next: Next): Promise<Response | void> => {
    return next();
  };
}
