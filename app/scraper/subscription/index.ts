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

let cachedSources: SubscriptionSource[] | null = null;
let sourcesLoadPromise: Promise<void> | null = null;

function cloneSources(sources: readonly SubscriptionSource[]): SubscriptionSource[] {
  return sources.map((source) => ({ ...source }));
}

/** 启动时加载一次信源配置，后续读取直接使用内存快照。 */
export async function initSourcesCache(): Promise<void> {
  if (cachedSources) return;
  if (!sourcesLoadPromise) {
    sourcesLoadPromise = loadSourcesFile()
      .then((sources) => {
        cachedSources = cloneSources(sources);
      })
      .finally(() => {
        sourcesLoadPromise = null;
      });
  }
  await sourcesLoadPromise;
}


/** 获取所有信源（扁平列表），供 scheduler 使用 */
export async function getAllSources(): Promise<SubscriptionSource[]> {
  await initSourcesCache();
  return cloneSources(cachedSources ?? []);
}

/** 去重后的 ref 列表，供 Feed / 聚合查询使用 */
export async function getAllSubscriptionRefs(): Promise<string[]> {
  const list = await getAllSources();
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
  const next = cloneSources(sources);
  await updateConfigFile((config) => {
    config.sources = next;
  });
  cachedSources = next;
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
  return JSON.stringify({ sources: await getAllSources() }, null, 2);
}
