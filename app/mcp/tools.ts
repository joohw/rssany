// MCP 工具：读取本地 sources / SQLite，并管理用户插件。

import { getItemById, getSourceStats, queryItems } from "../db/index.js";
import {
  deleteManagedPlugin,
  listManagedPlugins,
  readManagedPlugin,
  writeManagedPlugin,
} from "../plugins/management.js";
import { getAllSources } from "../scraper/subscription/index.js";

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties: false;
  };
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
}

export interface McpToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

const tools: McpToolDefinition[] = [
  {
    name: "list_sources",
    description: "List the RSS/web sources configured in this local RssAny instance.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  {
    name: "query_items",
    description: "Query locally indexed feed items by keyword, source, tags, author, date range, and pagination.",
    inputSchema: {
      type: "object",
      properties: {
        q: { type: "string", description: "SQLite FTS keyword query over title, summary, and content." },
        source_url: { type: "string", description: "Only return items from this source URL." },
        tags: { type: "array", items: { type: "string" }, description: "Match any of these tags." },
        author: { type: "string", description: "Fuzzy author match; at least 2 characters." },
        since: { type: "string", description: "ISO 8601 lower date/time bound." },
        until: { type: "string", description: "ISO 8601 upper date/time bound." },
        limit: { type: "integer", minimum: 1, maximum: 200, default: 50 },
        offset: { type: "integer", minimum: 0, default: 0 },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  {
    name: "get_item",
    description: "Get one locally indexed feed item by its guid/id, including full content.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", minLength: 1, description: "Feed item guid/id." },
      },
      required: ["id"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  {
    name: "get_source_stats",
    description: "Get local item counts and latest item timestamps grouped by source.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  {
    name: "list_plugins",
    description: "List plugins loaded from the local RssAny user plugin directory.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  {
    name: "read_plugin",
    description: "Read the effective source code of one loaded plugin.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", minLength: 1, description: "Plugin id." },
      },
      required: ["id"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  {
    name: "write_plugin",
    description:
      "Create or update a plugin in the RssAny user plugin directory and reload it immediately.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", minLength: 1, description: "Plugin id exported by the source code." },
        content: { type: "string", description: "Complete ESM plugin source code, up to 2 MiB." },
      },
      required: ["id", "content"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "delete_plugin",
    description:
      "Delete a plugin from the RssAny user plugin directory.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", minLength: 1, description: "User plugin id." },
      },
      required: ["id"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  },
];

function textResult(value: unknown, isError = false): McpToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
    ...(isError ? { isError: true } : {}),
  };
}

function objectArgs(value: unknown): Record<string, unknown> {
  if (value == null) return {};
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error("arguments 必须是 JSON 对象");
  }
  return value as Record<string, unknown>;
}

function optionalString(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  if (value == null || value === "") return undefined;
  if (typeof value !== "string") throw new Error(`${key} 必须是字符串`);
  return value.trim() || undefined;
}

function optionalDate(args: Record<string, unknown>, key: string): Date | undefined {
  const value = optionalString(args, key);
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${key} 不是合法的 ISO 日期`);
  return date;
}

function boundedInteger(
  args: Record<string, unknown>,
  key: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const value = args[key];
  if (value == null) return fallback;
  if (typeof value !== "number" || !Number.isInteger(value)) throw new Error(`${key} 必须是整数`);
  return Math.max(min, Math.min(max, value));
}

export function listMcpTools(): McpToolDefinition[] {
  return tools;
}

export async function callMcpTool(name: string, rawArgs: unknown): Promise<McpToolResult> {
  try {
    const args = objectArgs(rawArgs);
    if (name === "list_sources") {
      const sources = (await getAllSources()).map(({ ref, type, label, description, refresh, cron, weight }) => ({
        ref,
        type,
        label,
        description,
        refresh,
        cron,
        weight,
      }));
      return textResult({ sources, total: sources.length });
    }

    if (name === "query_items") {
      const tagsRaw = args.tags;
      if (tagsRaw != null && (!Array.isArray(tagsRaw) || tagsRaw.some((tag) => typeof tag !== "string"))) {
        throw new Error("tags 必须是字符串数组");
      }
      const result = await queryItems({
        q: optionalString(args, "q"),
        sourceUrl: optionalString(args, "source_url"),
        tags: Array.isArray(tagsRaw) ? tagsRaw.map(String).map((tag) => tag.trim()).filter(Boolean) : undefined,
        author: optionalString(args, "author"),
        since: optionalDate(args, "since"),
        until: optionalDate(args, "until"),
        limit: boundedInteger(args, "limit", 50, 1, 200),
        offset: boundedInteger(args, "offset", 0, 0, Number.MAX_SAFE_INTEGER),
      });
      const items = result.items.map(({ content: _content, translations: _translations, ...item }) => item);
      return textResult({ items, total: result.total });
    }

    if (name === "get_item") {
      const id = optionalString(args, "id");
      if (!id) throw new Error("id 不能为空");
      const item = await getItemById(id);
      if (!item) return textResult({ error: "条目不存在", id }, true);
      return textResult(item);
    }

    if (name === "get_source_stats") {
      const sources = await getSourceStats();
      return textResult({ sources, total: sources.length });
    }

    if (name === "list_plugins") {
      const plugins = listManagedPlugins();
      return textResult({ plugins, total: plugins.length });
    }

    if (name === "read_plugin") {
      const id = optionalString(args, "id");
      if (!id) throw new Error("id 不能为空");
      return textResult(await readManagedPlugin(id));
    }

    if (name === "write_plugin") {
      const id = optionalString(args, "id");
      if (!id) throw new Error("id 不能为空");
      if (typeof args.content !== "string") throw new Error("content 必须是字符串");
      return textResult({ ok: true, plugin: await writeManagedPlugin(id, args.content) });
    }

    if (name === "delete_plugin") {
      const id = optionalString(args, "id");
      if (!id) throw new Error("id 不能为空");
      return textResult(await deleteManagedPlugin(id));
    }

    return textResult({ error: `未知工具: ${name}` }, true);
  } catch (error) {
    return textResult({ error: error instanceof Error ? error.message : String(error) }, true);
  }
}
