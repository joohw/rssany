// Global HTTP(S) proxy settings: read/write .rssany/config.json.

import { readFile, writeFile } from "node:fs/promises";
import { CONFIG_PATH } from "./paths.js";

export type ProxySettings = {
  globalProxy: string;
  proxyList: string[];
};

function normalizeProxyList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v !== "string") continue;
    const t = v.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

async function readConfigRoot(): Promise<Record<string, unknown>> {
  try {
    const raw = await readFile(CONFIG_PATH, "utf-8");
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function readProxySettingsFromConfig(): Promise<ProxySettings> {
  const root = await readConfigRoot();
  const globalProxy = typeof root.globalProxy === "string" ? root.globalProxy.trim() : "";
  return {
    globalProxy,
    proxyList: normalizeProxyList(root.proxyList),
  };
}

export async function readGlobalProxyFromConfig(): Promise<string | undefined> {
  const { globalProxy } = await readProxySettingsFromConfig();
  return globalProxy.length > 0 ? globalProxy : undefined;
}

export async function readProxyListFromConfig(): Promise<string[]> {
  const { proxyList } = await readProxySettingsFromConfig();
  return proxyList;
}

export async function saveProxySettingsToConfig(settings: ProxySettings): Promise<void> {
  const root = await readConfigRoot();
  const globalProxy = settings.globalProxy.trim();
  const proxyList = normalizeProxyList(settings.proxyList);

  if (globalProxy) {
    root.globalProxy = globalProxy;
  } else {
    delete root.globalProxy;
  }

  if (proxyList.length > 0) {
    root.proxyList = proxyList;
  } else {
    delete root.proxyList;
  }

  await writeFile(CONFIG_PATH, JSON.stringify(root, null, 2) + "\n", "utf-8");
}

/** Write or clear globalProxy while preserving proxyList. */
export async function saveGlobalProxyToConfig(proxy: string): Promise<void> {
  const current = await readProxySettingsFromConfig();
  await saveProxySettingsToConfig({ ...current, globalProxy: proxy });
}

/** Plugin Site.proxy takes precedence over config globalProxy. */
export async function resolveProxyForSite(site: { proxy?: string }): Promise<string | undefined> {
  const s = site.proxy?.trim();
  if (s) return s;
  return readGlobalProxyFromConfig();
}
