// 投递目标：.rssany/config.json 的 deliver.url / deliver.token；非空 url 时在写库（及 pipeline）之后额外 POST 到该 URL

import { readFile, writeFile } from "node:fs/promises";
import { CONFIG_PATH } from "./paths.js";

export interface DeliverConfig {
  url: string;
  /** 与下游 Gateway（如 agidaily `data/token.txt`）一致：非空时请求头带 `Authorization: Bearer <token>` */
  token: string;
}

export async function getDeliverConfig(): Promise<DeliverConfig> {
  try {
    const raw = await readFile(CONFIG_PATH, "utf-8");
    const j = JSON.parse(raw) as { deliver?: { url?: string; token?: string } };
    const u = j?.deliver?.url;
    const t = j?.deliver?.token;
    return {
      url: typeof u === "string" ? u.trim() : "",
      token: typeof t === "string" ? t.trim() : "",
    };
  } catch {
    return { url: "", token: "" };
  }
}

/** 非空表示启用投递（不影响是否写库） */
export async function getDeliverUrl(): Promise<string> {
  return (await getDeliverConfig()).url;
}

export async function saveDeliverConfig(config: DeliverConfig): Promise<void> {
  let root: Record<string, unknown> = {};
  try {
    const raw = await readFile(CONFIG_PATH, "utf-8");
    root = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    // 无文件则新建
  }
  const prev = root.deliver;
  const base =
    typeof prev === "object" && prev !== null && !Array.isArray(prev)
      ? { ...(prev as Record<string, unknown>) }
      : {};
  const url = config.url.trim();
  const token = config.token.trim();
  const next: Record<string, unknown> = { ...base, url };
  if (token) next.token = token;
  else delete next.token;
  root.deliver = next;
  await writeFile(CONFIG_PATH, JSON.stringify(root, null, 2) + "\n", "utf-8");
}
