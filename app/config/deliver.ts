// Delivery targets: .rssany/config.json deliver.gateway(s) / deliver.token.
// Gateway base example: https://agidaily.cc/api/gateway
// Outbound paths are fixed: POST {gateway}/items, {gateway}/sources, {gateway}/test.

import { readConfigFile, updateConfigFile } from "./configFile.js";

export interface DeliverConfig {
  /** First gateway base, kept for compatibility with older callers. */
  gateway: string;
  /** Gateway bases without /items, /sources, or /test. */
  gateways: string[];
  /** Shared bearer token sent to every configured gateway when non-empty. */
  token: string;
}

type DeliverFileShape = {
  deliver?: {
    gateway?: string;
    gateways?: unknown;
    url?: string;
    urls?: unknown;
    sourcesUrl?: string;
    token?: string;
  };
};

function normalizeGateway(value: string): string {
  return value
    .trim()
    .replace(/\/(?:items|sources|test)\/?$/i, "")
    .replace(/\/+$/, "")
    .trim();
}

export function normalizeDeliverGateways(values: Iterable<unknown>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    if (typeof value !== "string") continue;
    const gateway = normalizeGateway(value);
    if (!gateway || seen.has(gateway)) continue;
    seen.add(gateway);
    out.push(gateway);
  }
  return out;
}

function unknownArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** Read new deliver.gateways plus legacy deliver.gateway / url / sourcesUrl. */
function migrateGatewaysFromFile(j: DeliverFileShape): string[] {
  const d = j?.deliver;
  return normalizeDeliverGateways([
    ...unknownArray(d?.gateways),
    d?.gateway,
    ...unknownArray(d?.urls),
    d?.url,
    d?.sourcesUrl,
  ]);
}

export async function getDeliverConfig(): Promise<DeliverConfig> {
  try {
    const j = await readConfigFile() as DeliverFileShape;
    const t = j?.deliver?.token;
    const gateways = migrateGatewaysFromFile(j);
    return {
      gateway: gateways[0] ?? "",
      gateways,
      token: typeof t === "string" ? t.trim() : "",
    };
  } catch {
    return { gateway: "", gateways: [], token: "" };
  }
}

/** Non-empty gateways enable item delivery without affecting local writes. */
export async function getDeliverUrl(): Promise<string> {
  const { gateway } = await getDeliverConfig();
  const base = gateway.trim().replace(/\/+$/, "");
  return base ? `${base}/items` : "";
}

export async function getDeliverUrls(): Promise<string[]> {
  const { gateways } = await getDeliverConfig();
  return gateways.map((gateway) => `${gateway}/items`);
}

export async function saveDeliverConfig(config: DeliverConfig): Promise<void> {
  const gateways = normalizeDeliverGateways(config.gateways.length > 0 ? config.gateways : [config.gateway]);
  const token = config.token.trim();
  const next: Record<string, unknown> = {};
  if (gateways.length > 0) {
    next.gateway = gateways[0];
    next.gateways = gateways;
  }
  if (token) next.token = token;
  await updateConfigFile((root) => {
    root.deliver = next;
  });
}
