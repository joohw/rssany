// 信源配置模块：读取 .rssany/config.json 的 sources（扁平信源列表，供 scheduler 使用）

import { readConfigFile, updateConfigFile } from "../../config/configFile.js";
import type { SourceGroupTreeNode, SourceProxyMode, SubscriptionSource } from "./types.js";
import { normalizeSourceGroup, normalizeSourceProxyMode, resolveRef } from "./types.js";
import { readGlobalProxyFromConfig } from "../../config/globalProxy.js";

export type { SourceGroupTreeNode, SourceProxyMode, SubscriptionSource, SourcesFile } from "./types.js";
export { normalizeSourceGroup, normalizeSourceProxyMode, resolveRef } from "./types.js";


/** 从 .rssany/config.json 的 sources 加载。 */
async function loadSourcesFile(): Promise<SubscriptionSource[]> {
  const parsed = await readConfigFile();
  const sources = parsed.sources;
  return Array.isArray(sources)
    ? (sources as SubscriptionSource[])
        .filter((source) => resolveRef(source))
        .map(normalizeSubscriptionSource)
    : [];
}

let cachedSources: SubscriptionSource[] | null = null;
let sourcesLoadPromise: Promise<void> | null = null;

function normalizeSubscriptionSource(source: SubscriptionSource): SubscriptionSource {
  const proxyMode = normalizeSourceProxyMode(source.proxyMode, source.proxy);
  const normalized: SubscriptionSource = {
    ...source,
    group: normalizeSourceGroup(source.group),
    proxyMode,
  };
  if (proxyMode === "custom") normalized.proxy = source.proxy?.trim();
  else delete normalized.proxy;
  return normalized;
}

function cloneSources(sources: readonly SubscriptionSource[]): SubscriptionSource[] {
  return sources.map(normalizeSubscriptionSource);
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


/** 获取所有信源（扁平存储，group 表达展示层级），供 scheduler 使用 */
export async function getAllSources(): Promise<SubscriptionSource[]> {
  await initSourcesCache();
  return cloneSources(cachedSources ?? []);
}

type MutableSourceGroupNode = Omit<SourceGroupTreeNode, "children"> & {
  children: Map<string, MutableSourceGroupNode>;
};

/** 从扁平信源配置构建稳定顺序的分组树，节点计数包含全部后代。 */
export function buildSourceGroupTree(sources: readonly SubscriptionSource[]): SourceGroupTreeNode[] {
  const roots = new Map<string, MutableSourceGroupNode>();
  for (const source of sources) {
    let siblings = roots;
    const path: string[] = [];
    for (const segment of normalizeSourceGroup(source.group)) {
      path.push(segment);
      let node = siblings.get(segment);
      if (!node) {
        node = { name: segment, path: [...path], sourceCount: 0, children: new Map() };
        siblings.set(segment, node);
      }
      node.sourceCount += 1;
      siblings = node.children;
    }
  }
  const serialize = (nodes: Map<string, MutableSourceGroupNode>): SourceGroupTreeNode[] =>
    [...nodes.values()].map((node) => ({
      name: node.name,
      path: [...node.path],
      sourceCount: node.sourceCount,
      children: serialize(node.children),
    }));
  return serialize(roots);
}

export async function getSourceGroupTree(): Promise<SourceGroupTreeNode[]> {
  return buildSourceGroupTree(await getAllSources());
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


/** 将信源列表写回 config.json；group 缺省时规范化为根路径 []。 */
export async function saveSourcesFile(sources: SubscriptionSource[]): Promise<void> {
  const next = cloneSources(sources);
  await updateConfigFile((config) => {
    config.sources = next;
  });
  cachedSources = next;
}


/** 纯代理策略解析。空字符串表示显式直连，并阻止 fetcher 继承环境代理。 */
export function resolveSourceProxyPolicy(
  sub: Pick<SubscriptionSource, "proxyMode" | "proxy"> | undefined,
  collectorProxy: string | undefined,
  globalProxy: string | undefined,
): string {
  if (sub) {
    const mode: SourceProxyMode = normalizeSourceProxyMode(sub.proxyMode, sub.proxy);
    if (mode === "default") return globalProxy?.trim() ?? "";
    if (mode === "custom") return sub.proxy?.trim() ?? "";
    return "";
  }
  return collectorProxy?.trim() ?? "";
}

/**
 * 已配置的信源默认直连；仅 proxyMode=default/custom 时走相应代理。
 * 未加入信源列表的临时 URL 仍可使用采集器自身声明的代理，但不会自动套用全局或环境代理。
 */
export async function getEffectiveProxyForListUrl(listUrl: string, source: { proxy?: string }): Promise<string | undefined> {
  const list = await getAllSources();
  const sub = list.find((s) => resolveRef(s) === listUrl);
  const globalProxy = sub?.proxyMode === "default" ? await readGlobalProxyFromConfig() : undefined;
  return resolveSourceProxyPolicy(sub, source.proxy, globalProxy);
}

/** 读取 config.json 中的 sources 片段（用于 GET /api/sources/raw）。 */
export async function getSourcesRaw(): Promise<string> {
  return JSON.stringify({ sources: await getAllSources() }, null, 2);
}
