// 宿主应用解析的常用依赖，注入到 CollectorContext / SiteCollectorContext.deps
// 用户目录下的 .rssany/collectors 内脚本无法解析应用 node_modules，须通过 ctx.deps 使用

import { parse, NodeType } from "node-html-parser";
import { createHash } from "node:crypto";
import RssParser from "rss-parser";
import { HttpsProxyAgent } from "https-proxy-agent";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { logger } from "../core/logger/index.js";

export const COLLECTOR_HOST_DEPS = {
  parseHtml: parse,
  NodeType,
  createHash,
  RssParser,
  HttpsProxyAgent,
  ImapFlow,
  simpleParser,
  logger,
} as const;

export type CollectorHostDeps = typeof COLLECTOR_HOST_DEPS;
