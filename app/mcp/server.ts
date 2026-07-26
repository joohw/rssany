// MCP JSON-RPC 核心：与传输解耦，供 SSE 路由和协议测试复用。

import { getAppVersion } from "../version.js";
import { callMcpTool, listMcpTools } from "./tools.js";

export type JsonRpcId = string | number | null;

interface JsonRpcRequest {
  jsonrpc?: unknown;
  id?: unknown;
  method?: unknown;
  params?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

const PROTOCOL_VERSION = "2024-11-05";

function responseId(value: unknown): JsonRpcId {
  return typeof value === "string" || typeof value === "number" || value === null ? value : null;
}

function errorResponse(id: JsonRpcId, code: number, message: string, data?: unknown): JsonRpcResponse {
  return {
    jsonrpc: "2.0",
    id,
    error: { code, message, ...(data === undefined ? {} : { data }) },
  };
}

/** 返回 undefined 表示通知已处理且按 JSON-RPC 规范不应回复。 */
export async function handleMcpJsonRpc(input: unknown): Promise<JsonRpcResponse | undefined> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return errorResponse(null, -32600, "Invalid Request");
  }
  const request = input as JsonRpcRequest;
  const id = responseId(request.id);
  const isNotification = request.id === undefined;
  if (request.jsonrpc !== "2.0" || typeof request.method !== "string") {
    return errorResponse(id, -32600, "Invalid Request");
  }

  if (request.method.startsWith("notifications/")) return undefined;

  if (request.method === "initialize") {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "rssany-local", version: getAppVersion() },
        instructions:
          "Access local RssAny sources and indexed items. Plugin tools can read, create, update, and delete user plugins.",
      },
    };
  }

  if (request.method === "ping") {
    return { jsonrpc: "2.0", id, result: {} };
  }

  if (request.method === "tools/list") {
    return { jsonrpc: "2.0", id, result: { tools: listMcpTools() } };
  }

  if (request.method === "tools/call") {
    const params = request.params;
    if (!params || typeof params !== "object" || Array.isArray(params)) {
      return errorResponse(id, -32602, "Invalid params");
    }
    const { name, arguments: args } = params as { name?: unknown; arguments?: unknown };
    if (typeof name !== "string" || !name.trim()) {
      return errorResponse(id, -32602, "Invalid params: name is required");
    }
    const result = await callMcpTool(name, args);
    return { jsonrpc: "2.0", id, result };
  }

  if (isNotification) return undefined;
  return errorResponse(id, -32601, "Method not found");
}

export function parseJsonRpcBody(raw: string): { value: unknown } | { error: JsonRpcResponse } {
  try {
    return { value: JSON.parse(raw) as unknown };
  } catch (error) {
    return {
      error: errorResponse(null, -32700, "Parse error", error instanceof Error ? error.message : String(error)),
    };
  }
}
