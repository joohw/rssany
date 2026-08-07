// 本地 MCP SSE：GET 建立会话，POST JSON-RPC，响应通过 SSE message 事件返回。

import { randomUUID } from "node:crypto";
import type { Context, Hono, Next } from "hono";
import { streamSSE } from "hono/streaming";
import { handleMcpJsonRpc, parseJsonRpcBody, type JsonRpcResponse } from "../../mcp/server.js";

interface McpSseSession {
  send(response: JsonRpcResponse): Promise<void>;
}

const sessions = new Map<string, McpSseSession>();
const MAX_SESSIONS = 32;

async function requireLocalMcp(c: Context, next: Next): Promise<Response | void> {
  if (process.env.RSSANY_MCP_ALLOW_REMOTE === "1") return next();
  const incoming = (c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined)?.incoming;
  const remoteAddress = incoming?.socket?.remoteAddress;
  // app.request() 等内存调用没有 socket；真实 Node HTTP 请求必须来自 loopback。
  if (
    remoteAddress == null ||
    remoteAddress === "127.0.0.1" ||
    remoteAddress === "::1" ||
    remoteAddress === "::ffff:127.0.0.1"
  ) {
    return next();
  }
  return c.json({ error: "MCP 仅允许本机访问；如需远程访问请设置 RSSANY_MCP_ALLOW_REMOTE=1" }, 403);
}

export function registerMcpRoutes(app: Hono): void {
  app.use("/mcp", requireLocalMcp);
  app.use("/mcp/*", requireLocalMcp);

  app.get("/mcp", (c) => c.json({
    name: "rssany-local",
    transport: "sse",
    streamableHttp: "/mcp",
    sse: "/mcp/sse",
    messages: "/mcp/messages?sessionId={sessionId}",
    readOnly: false,
    localOnly: process.env.RSSANY_MCP_ALLOW_REMOTE !== "1",
  }));

  // 无状态 Streamable HTTP：供 Codex、ChatGPT desktop 和现代 MCP 客户端直连。
  app.post("/mcp", async (c) => {
    const parsed = parseJsonRpcBody(await c.req.text());
    const response = "error" in parsed ? parsed.error : await handleMcpJsonRpc(parsed.value);
    if (!response) return c.body(null, 202);
    return c.json(response);
  });

  app.get("/mcp/sse", (c) => {
    if (sessions.size >= MAX_SESSIONS) {
      return c.json({ error: "MCP SSE 会话数量已达上限" }, 503);
    }
    const sessionId = randomUUID();
    return streamSSE(c, async (stream) => {
      const session: McpSseSession = {
        async send(response) {
          await stream.writeSSE({ event: "message", data: JSON.stringify(response) });
        },
      };
      sessions.set(sessionId, session);
      await stream.writeSSE({
        event: "endpoint",
        data: `/mcp/messages?sessionId=${encodeURIComponent(sessionId)}`,
        retry: 3000,
      });
      const heartbeat = setInterval(() => {
        stream.writeSSE({ event: "ping", data: "" }).catch(() => {});
      }, 25_000);
      stream.onAbort(() => {
        clearInterval(heartbeat);
        if (sessions.get(sessionId) === session) sessions.delete(sessionId);
      });
      await new Promise<void>((resolve) => stream.onAbort(resolve));
    });
  });

  app.post("/mcp/messages", async (c) => {
    const sessionId = c.req.query("sessionId")?.trim() ?? "";
    const session = sessions.get(sessionId);
    if (!session) return c.json({ error: "MCP SSE 会话不存在或已关闭" }, 404);

    const raw = await c.req.text();
    const parsed = parseJsonRpcBody(raw);
    const response = "error" in parsed ? parsed.error : await handleMcpJsonRpc(parsed.value);
    if (response) await session.send(response);
    return c.body(null, 202);
  });
}
