// 投递目标：.rssany/config.json 的 deliver.gateway / deliver.token
// Gateway 基址示例：https://agidaily.cc/api/gateway
// 出站固定为：POST {gateway}/items、POST {gateway}/sources、连通性测试 POST {gateway}/test

import { readConfigFile, updateConfigFile } from "./configFile.js";

export interface DeliverConfig {
  /** 基址，不含 /items；如 https://agidaily.cc/api/gateway */
  gateway: string;
  /** 与下游 Gateway（如 agidaily `data/token.txt`）一致：非空时请求头带 `Authorization: Bearer <token>` */
  token: string;
}

type DeliverFileShape = {
  deliver?: { gateway?: string; url?: string; sourcesUrl?: string; token?: string };
};

/** 从旧版 deliver.url（…/items）或 deliver.sourcesUrl 推断 gateway 基址 */
function migrateGatewayFromFile(j: DeliverFileShape): string {
  const g = j?.deliver?.gateway?.trim();
  if (g) return g;
  const u = j?.deliver?.url?.trim() ?? "";
  if (u) {
    return u
      .replace(/\/items\/?$/i, "")
      .replace(/\/+$/, "")
      .trim();
  }
  const s = j?.deliver?.sourcesUrl?.trim() ?? "";
  if (s) {
    return s
      .replace(/\/sources\/?$/i, "")
      .replace(/\/+$/, "")
      .trim();
  }
  return "";
}

export async function getDeliverConfig(): Promise<DeliverConfig> {
  try {
    const j = await readConfigFile() as DeliverFileShape;
    const t = j?.deliver?.token;
    return {
      gateway: migrateGatewayFromFile(j),
      token: typeof t === "string" ? t.trim() : "",
    };
  } catch {
    return { gateway: "", token: "" };
  }
}

/** 非空 gateway 表示启用条目投递（不影响是否写库） */
export async function getDeliverUrl(): Promise<string> {
  const { gateway } = await getDeliverConfig();
  const base = gateway.trim().replace(/\/+$/, "");
  return base ? `${base}/items` : "";
}

export async function saveDeliverConfig(config: DeliverConfig): Promise<void> {
  const gateway = config.gateway.trim();
  const token = config.token.trim();
  const next: Record<string, unknown> = {};
  if (gateway) next.gateway = gateway;
  if (token) next.token = token;
  await updateConfigFile((root) => {
    root.deliver = next;
  });
}
