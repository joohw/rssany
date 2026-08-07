import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { handleMcpJsonRpc } from "../app/mcp/server.ts";
import { registerMcpRoutes } from "../app/router/routes/mcp.ts";

async function readSseEvent(reader, expectedEvent) {
  const decoder = new TextDecoder();
  let buffer = "";
  for (let i = 0; i < 20; i++) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() ?? "";
    for (const block of blocks) {
      const event = block.match(/^event: (.+)$/m)?.[1];
      const data = block.match(/^data: ?(.*)$/m)?.[1] ?? "";
      if (event === expectedEvent) return data;
    }
  }
  throw new Error(`未收到 SSE 事件: ${expectedEvent}`);
}

describe("local MCP SSE", () => {
  it("advertises local plugin mutation support", async () => {
    const app = new Hono();
    registerMcpRoutes(app);
    const response = await app.request("/mcp");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      transport: "sse",
      readOnly: false,
      localOnly: true,
    });
  });

  it("exposes MCP tools over an SSE session", async () => {
    const app = new Hono();
    registerMcpRoutes(app);

    const response = await app.request("/mcp/sse");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const reader = response.body.getReader();

    const endpoint = await readSseEvent(reader, "endpoint");
    expect(endpoint).toMatch(/^\/mcp\/messages\?sessionId=/);

    const postResponse = await app.request(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "test", version: "1" } },
      }),
    });
    expect(postResponse.status).toBe(202);

    const message = JSON.parse(await readSseEvent(reader, "message"));
    expect(message.id).toBe(1);
    expect(message.result.serverInfo.name).toBe("rssany-local");
    expect(message.result.capabilities.tools).toBeDefined();

    const malformedResponse = await app.request(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });
    expect(malformedResponse.status).toBe(202);
    const parseError = JSON.parse(await readSseEvent(reader, "message"));
    expect(parseError.error.code).toBe(-32700);
    await reader.cancel();
  });

  it("exposes the same MCP server over stateless Streamable HTTP", async () => {
    const app = new Hono();
    registerMcpRoutes(app);

    const initialize = await app.request("/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "test", version: "1" } },
      }),
    });
    expect(initialize.status).toBe(200);
    expect(initialize.headers.get("content-type")).toContain("application/json");
    await expect(initialize.json()).resolves.toMatchObject({
      id: 1,
      result: {
        protocolVersion: "2025-03-26",
        serverInfo: { name: "rssany-local" },
      },
    });

    const notification = await app.request("/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
    });
    expect(notification.status).toBe(202);
  });

  it("lists the backend tools and their mutation annotations", async () => {
    const response = await handleMcpJsonRpc({
      jsonrpc: "2.0",
      id: "tools",
      method: "tools/list",
      params: {},
    });
    const tools = response?.result.tools;
    expect(tools.map((tool) => tool.name)).toEqual([
      "list_sources",
      "query_items",
      "get_item",
      "get_source_stats",
      "list_plugins",
      "read_plugin",
      "write_plugin",
      "delete_plugin",
    ]);
    expect(tools.find((tool) => tool.name === "write_plugin")?.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: true,
    });
  });
});
