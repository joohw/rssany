import { PLUGIN_HOST_DEPS } from "../../plugins/hostDeps.js";
import type { SourceContext } from "./types.js";
import { fetchHtml as fetchHtmlFn } from "./web/fetcher/index.js";

/** 构造带 deps 的信源上下文（抓取、preCheck、插件 fetchItems 均须使用） */
export function buildSourceContext(partial: {
  cacheDir?: string;
  headless?: boolean;
  proxy?: string;
}): SourceContext {
  const { cacheDir, headless, proxy } = partial;
  return {
    ...partial,
    deps: PLUGIN_HOST_DEPS,
    async fetchHtml(url, opts) {
      const res = await fetchHtmlFn(url, {
        cacheDir,
        useCache: false,
        headless,
        proxy,
        waitAfterLoadMs: opts?.waitMs,
        purify: opts?.purify,
        waitForSelector: opts?.waitForSelector,
        waitForSelectorTimeoutMs: opts?.waitForSelectorTimeoutMs,
        useHttpResponseBody: opts?.useHttpResponseBody,
      });
      return { html: res.body, finalUrl: res.finalUrl ?? url, status: res.status };
    },
  };
}
