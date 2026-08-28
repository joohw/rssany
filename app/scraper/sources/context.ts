import { COLLECTOR_HOST_DEPS } from "../../collectors/hostDeps.js";
import type { CollectorContext } from "./types.js";
import { fetchHtml as fetchHtmlFn } from "./web/fetcher/index.js";

/** 构造带 deps 的采集器上下文（抓取、preCheck、fetchItems 均须使用） */
export function buildCollectorContext(partial: {
  cacheDir?: string;
  headless?: boolean;
  proxy?: string;
}): CollectorContext {
  const { cacheDir, headless, proxy } = partial;
  return {
    ...partial,
    deps: COLLECTOR_HOST_DEPS,
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
