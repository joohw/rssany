// MCP 工具：读取本地 sources / SQLite，并管理用户采集器。

import { getItemById, getSourceStats, queryItems, queryLogs } from "../db/index.js";
import {
  deleteManagedCollector,
  listManagedCollectors,
  readManagedCollector,
  writeManagedCollector,
} from "../collectors/management.js";
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
    name: "query_logs",
    description: "Query local RssAny runtime logs by level, category, date range, and pagination.",
    inputSchema: {
      type: "object",
      properties: {
        level: { type: "string", enum: ["error", "warn", "info", "debug"], description: "Exact log level." },
        category: { type: "string", description: "Case-insensitive partial category match." },
        since: { type: "string", description: "ISO 8601 inclusive lower date/time bound." },
        until: { type: "string", description: "ISO 8601 exclusive upper date/time bound." },
        limit: { type: "integer", minimum: 1, maximum: 200, default: 100 },
        offset: { type: "integer", minimum: 0, default: 0 },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  {
    name: "list_collectors",
    description: "List collectors loaded from the local RssAny user collector directory.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  {
    name: "read_collector",
    description: "Read the effective source code of one loaded collector.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", minLength: 1, description: "Collector id." },
      },
      required: ["id"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  {
    name: "write_collector",
    description:
      "Create or update a collector in the RssAny user collector directory and reload it immediately.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", minLength: 1, description: "Collector id exported by the source code." },
        content: { type: "string", description: "Complete ESM collector source code, up to 2 MiB." },
      },
      required: ["id", "content"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "delete_collector",
    description:
      "Delete a collector from the RssAny user collector directory.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", minLength: 1, description: "User collector id." },
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
      const sources = (await getAllSources()).map(({ ref, type, label, description, group, refresh, cron, weight }) => ({
        ref,
        type,
        label,
        description,
        group,
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

    if (name === "query_logs") {
      const levelRaw = optionalString(args, "level");
      if (levelRaw && !["error", "warn", "info", "debug"].includes(levelRaw)) {
        throw new Error("level 必须是 error、warn、info 或 debug");
      }
      const since = optionalDate(args, "since");
      const until = optionalDate(args, "until");
      if (since && until && since >= until) throw new Error("since 必须早于 until");
      const result = await queryLogs({
        level: levelRaw as "error" | "warn" | "info" | "debug" | undefined,
        category: optionalString(args, "category"),
        since,
        until,
        limit: boundedInteger(args, "limit", 100, 1, 200),
        offset: boundedInteger(args, "offset", 0, 0, Number.MAX_SAFE_INTEGER),
      });
      return textResult({ logs: result.items, total: result.total });
    }

    if (name === "list_collectors") {
      const collectors = listManagedCollectors();
      return textResult({ collectors, total: collectors.length });
    }

    if (name === "read_collector") {
      const id = optionalString(args, "id");
      if (!id) throw new Error("id 不能为空");
      return textResult(await readManagedCollector(id));
    }

    if (name === "write_collector") {
      const id = optionalString(args, "id");
      if (!id) throw new Error("id 不能为空");
      if (typeof args.content !== "string") throw new Error("content 必须是字符串");
      return textResult({ ok: true, collector: await writeManagedCollector(id, args.content) });
    }

    if (name === "delete_collector") {
      const id = optionalString(args, "id");
      if (!id) throw new Error("id 不能为空");
      return textResult(await deleteManagedCollector(id));
    }

    return textResult({ error: `未知工具: ${name}` }, true);
  } catch (error) {
    return textResult({ error: error instanceof Error ? error.message : String(error) }, true);
  }
}
