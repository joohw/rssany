// 投递目标：.rssany/config.json 的 deliver.url；非空则在写库（及 pipeline）之后额外 POST 到该 URL

import { readFile, writeFile } from "node:fs/promises";
import { CONFIG_PATH } from "./paths.js";

/** 非空表示启用投递（不影响是否写库） */
export async function getDeliverUrl(): Promise<string> {
  try {
    const raw = await readFile(CONFIG_PATH, "utf-8");
    const j = JSON.parse(raw) as { deliver?: { url?: string } };
    const u = j?.deliver?.url;
    return typeof u === "string" ? u.trim() : "";
  } catch {
    return "";
  }
}

export async function saveDeliverUrl(url: string): Promise<void> {
  let root: Record<string, unknown> = {};
  try {
    const raw = await readFile(CONFIG_PATH, "utf-8");
    root = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    // 无文件则新建
  }
  root.deliver = { url: url.trim() };
  await writeFile(CONFIG_PATH, JSON.stringify(root, null, 2) + "\n", "utf-8");
}
