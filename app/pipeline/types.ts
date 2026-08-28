import type { FeedItem } from "../types/feedItem.js";

export interface PipelineContext {
  sourceUrl?: string;
  llm?: {
    chatJson: (prompt: string, config?: unknown, opts?: { maxTokens?: number; debugLabel?: string }) => Promise<Record<string, unknown>>;
    chatText: (prompt: string, config?: unknown, opts?: { maxTokens?: number; debugLabel?: string }) => Promise<string>;
  };
  db?: { getSystemTags: () => Promise<string[]> };
}

/** A Pipeline handles one item. Returning null removes the item from the feed. */
export interface PipelineDefinition {
  id: string;
  name: string;
  description?: string;
  process: (item: FeedItem, context: PipelineContext) => Promise<FeedItem | null> | FeedItem | null;
}

export interface PipelineSummary {
  id: string;
  name: string;
  description?: string;
  scope: "builtin" | "user";
  canDelete: boolean;
}
