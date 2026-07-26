// 信源配置模块：读取 .rssany/config.json 的 sources（扁平信源列表，供 scheduler 使用）

import { readConfigFile, updateConfigFile } from "../../config/configFile.js";
import type { SubscriptionSource } from "./types.js";
import { resolveRef } from "./types.js";
import type { Source } from "../sources/types.js";
import { readGlobalProxyFromConfig } from "../../config/globalProxy.js";

export type { SubscriptionSource, SourcesFile } from "./types.js";
export { resolveRef } from "./types.js";


/** 从 .rssany/config.json 的 sources 加载。 */
async function loadSourcesFile(): Promise<SubscriptionSource[]> {
  const parsed = await readConfigFile();
  const sources = parsed.sources;
  return Array.isArray(sources)
    ? (sources as SubscriptionSource[]).filter((source) => resolveRef(source))
    : [];
}


/** 获取所有信源（扁平列表），供 scheduler 使用 */
export async function getAllSources(): Promise<SubscriptionSource[]> {
  return loadSourcesFile();
}

/** 去重后的 ref 列表，供 Feed / 聚合查询使用 */
export async function getAllSubscriptionRefs(): Promise<string[]> {
  const list = await loadSourcesFile();
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of list) {
    const r = resolveRef(s);
    if (r && !seen.has(r)) {
      seen.add(r);
      out.push(r);
    }
  }
  return out;
}


/** 将扁平列表写回 config.json；供 raw API 写入 */
export async function saveSourcesFile(sources: SubscriptionSource[]): Promise<void> {
  await updateConfigFile((config) => {
    config.sources = sources;
  });
}


/**
 * 代理优先级：config.json 单源 → 插件 Source.proxy → config.json globalProxy →（未写入则由 fetcher resolveProxy 使用 HTTP_PROXY）
 */
export async function getEffectiveProxyForListUrl(listUrl: string, source: Source): Promise<string | undefined> {
  const list = await getAllSources();
  const sub = list.find((s) => resolveRef(s) === listUrl);
  const fromSub = sub?.proxy?.trim();
  if (fromSub) return fromSub;
  const fromPlugin = source.proxy?.trim();
  if (fromPlugin) return fromPlugin;
  return readGlobalProxyFromConfig();
}

/** 读取 config.json 中的 sources 片段（用于 GET /api/sources/raw）。 */
export async function getSourcesRaw(): Promise<string> {
  return JSON.stringify({ sources: await loadSourcesFile() }, null, 2);
}
