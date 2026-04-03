// Feeder：根据 URL 生成 RSS / 条目列表，与 router 解耦

export { getItems, feedItemsToRssXml } from "./feeder.js";
export type { FeederConfig } from "./types.js";
