// 统一采集器注册表：汇聚站点采集器、通用采集器与 genericWebCollector，提供匹配入口

import { createWebCollector, genericWebCollector, setLoadedSiteCollectors } from "./web/index.js";
import { loadAllCollectors } from "../../collectors/loader.js";
import type { Collector } from "./types.js";
import { logger } from "../../core/logger/index.js";
export { buildCollectorContext } from "./context.js";

/** 所有已注册的采集器（按 priority 排序后迭代匹配） */
export const registeredCollectors: Collector[] = [];

/** 将字符串 URL 模式转为正则：{placeholder} 匹配单个路径段，末尾允许 query */
function sourcePatternToRegex(pattern: string | RegExp): RegExp {
  if (pattern instanceof RegExp) return pattern;
  const pathOnly = pattern.split("?")[0];
  const pl = "<<<__PL__>>>";
  const escaped = pathOnly
    .replace(/\{[^}]*\}/g, pl)
    .replace(/[.*+?^${}()|[\]\\]/g, (c) => "\\" + c)
    .replace(new RegExp(pl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), "[^/]+");
  return new RegExp("^" + escaped + "(\\?.*)?$");
}


/** 根据 sourceId 查找匹配度最高的采集器；按 priority 升序，优先用 match 否则用 pattern */
export function getCollector(sourceId: string): Collector {
  for (const collector of registeredCollectors) {
    const matches = collector.match ? collector.match(sourceId) : (() => {
      try {
        return sourcePatternToRegex(collector.pattern).test(sourceId);
      } catch {
        return false;
      }
    })();
    if (matches) return collector;
  }
  return genericWebCollector;
}


/** 根据 id 精确查找采集器（用于内部调试） */
export function getCollectorById(id: string): Collector | undefined {
  return registeredCollectors.find((collector) => collector.id === id);
}


/** 初始化所有采集器并构建注册表。 */
export async function initCollectors(): Promise<void> {
  const { sites, collectors } = await loadAllCollectors();
  setLoadedSiteCollectors(sites);
  registeredCollectors.length = 0;
  const webCollectors = sites.map((site) => createWebCollector(site));
  const all: Collector[] = [
    ...collectors,
    ...webCollectors,
    genericWebCollector,
  ];
  all.sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
  registeredCollectors.push(...all);
  logger.info("scheduler", "采集器已注册", {
    total: registeredCollectors.length,
    siteCount: sites.length,
    collectorCount: collectors.length,
  });
}
