import { chatJson, chatText } from "../core/llm.js";
import {
  deleteItem,
  getItemById,
  getSystemTags,
  queryItems,
  updateItemAfterPipeline,
  type DbItem,
} from "../db/index.js";
import type { FeedItem } from "../types/feedItem.js";
import { runPipeline, type PipelineContext } from "./index.js";

export interface PipelineRunSelection {
  itemIds?: string[];
  sourceRef?: string;
  since?: Date;
  until?: Date;
  limit: number;
  stepIds?: string[];
}

export interface PipelineRunResult {
  selected: number;
  processed: number;
  updated: number;
  dropped: number;
  missing: number;
  stepIds: string[] | null;
}

const pipelineContext: PipelineContext = {
  llm: { chatJson, chatText } as PipelineContext["llm"],
  db: { getSystemTags },
};

function dbItemToFeedItem(item: DbItem): FeedItem {
  const parsedDate = new Date(item.pub_date ?? item.fetched_at);
  return {
    guid: item.id,
    title: item.title ?? "",
    link: item.url,
    pubDate: Number.isNaN(parsedDate.getTime()) ? new Date(0) : parsedDate,
    author: item.author ?? undefined,
    summary: item.summary ?? undefined,
    content: item.content ?? undefined,
    imageUrl: item.image_url ?? undefined,
    tags: item.tags ?? undefined,
    sourceRef: item.source_url,
    translations: item.translations ?? undefined,
    extra: item.extra ?? undefined,
  };
}

export async function rerunPipeline(selection: PipelineRunSelection): Promise<PipelineRunResult> {
  const missingIds: string[] = [];
  let rows: DbItem[];
  if (selection.itemIds?.length) {
    const resolved = await Promise.all(selection.itemIds.map(async (id) => {
      const item = await getItemById(id);
      if (!item) missingIds.push(id);
      return item;
    }));
    rows = resolved.filter((item): item is DbItem => item != null);
  } else {
    const result = await queryItems({
      sourceUrl: selection.sourceRef,
      since: selection.since,
      until: selection.until,
      limit: selection.limit,
    });
    rows = result.items;
  }

  let updated = 0;
  let dropped = 0;
  for (const row of rows) {
    const item = dbItemToFeedItem(row);
    const processed = await runPipeline(item, { ...pipelineContext, sourceUrl: row.source_url }, selection.stepIds);
    if (!processed) {
      if (await deleteItem(row.id)) dropped += 1;
      continue;
    }
    await updateItemAfterPipeline(processed);
    updated += 1;
  }

  return {
    selected: rows.length,
    processed: updated + dropped,
    updated,
    dropped,
    missing: missingIds.length,
    stepIds: selection.stepIds ?? null,
  };
}
