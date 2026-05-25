import type { AppLanguage } from "@/i18n/config";
import { normalizePath, SITE_NAME } from "@/lib/site";

export type SeoPageKey = "home";

type SeoCopy = {
  title: string;
  description: string;
  ogImage: string;
};

export const SEO_COPY: Record<AppLanguage, Record<SeoPageKey, SeoCopy>> = {
  "zh-CN": {
    home: {
      title: "自托管 RSS 订阅管线 · 网页 / RSS / 邮件统一入库 · rssany",
      description:
        "RssAny 把网页列表、RSS/Atom、邮件等信源通过定时抓取与插件解析，变成统一条目库，再输出 RSS XML、JSON API，并可选 MCP 消费。",
      ogImage: "/use-case-zh.png",
    },
  },
  en: {
    home: {
      title: "Self-hosted RSS pipeline · unify web, RSS, and email feeds · rssany",
      description:
        "RssAny fetches web lists, RSS/Atom, and email sources on a schedule, parses them with plugins, deduplicates into SQLite, and outputs RSS XML, JSON API, and optional MCP tools.",
      ogImage: "/use-case-en.png",
    },
  },
};

export function hreflangUrl(siteUrl: string, pathname: string, language: AppLanguage): string {
  const path = normalizePath(pathname);
  const separator = path.includes("?") ? "&" : "?";
  return `${siteUrl}${path}${separator}lang=${encodeURIComponent(language)}`;
}

export function resolvePageCopy(page: SeoPageKey, language: AppLanguage): SeoCopy {
  return SEO_COPY[language][page];
}

export function pathnameForPage(page: SeoPageKey): string {
  if (page === "home") return "/";
  return "/";
}

export type FaqItem = { question: string; answer: string };

export const FAQ_ITEMS: Record<AppLanguage, FaqItem[]> = {
  "zh-CN": [
    {
      question: "RssAny 是什么？",
      answer:
        "RssAny 是一套自托管的订阅管线：抓取网页列表、标准 RSS、IMAP 邮件等信源，解析与补全文后入库去重，再按需生成 RSS/Atom/JSON Feed 与 JSON API。核心是「爬取 → 入库 → 转可订阅流」。",
    },
    {
      question: "支持哪些信源类型？",
      answer:
        "内置大量 Site 插件（.rssany.js），也支持标准 RSS/Atom 与邮件信源。用户可在 ~/.rssany/plugins 覆盖或扩展插件，并在 sources.json 中配置刷新间隔与代理。",
    },
    {
      question: "需要数据库吗？数据存在哪里？",
      answer:
        "使用 Node.js 内置 SQLite，默认在 ~/.rssany/data/rssany.db。条目、日志与用户数据均落在该目录，升级 npm 包不会覆盖你的配置。",
    },
    {
      question: "可以接 LLM 或自动打标签吗？",
      answer:
        "可以。解析、正文提取、pipeline 中的标签与翻译等步骤可按 config.json 启用，并配置 OpenAI 兼容接口。pipeline 是固定代码链，不是用户插件目录。",
    },
    {
      question: "如何安装与启动？",
      answer:
        "推荐 npm install -g rssany 后执行 rssany，浏览器打开默认 http://127.0.0.1:18473/。也可从源码 pnpm install && pnpm run build:all && pnpm start 运行。",
    },
  ],
  en: [
    {
      question: "What is RssAny?",
      answer:
        "RssAny is a self-hosted subscription pipeline: it fetches web lists, RSS/Atom, and IMAP mail, parses and enriches items, deduplicates into SQLite, and exposes RSS/Atom/JSON feeds plus JSON API. The core loop is fetch → store → publish.",
    },
    {
      question: "Which source types are supported?",
      answer:
        "Dozens of built-in Site plugins (.rssany.js), standard RSS/Atom feeds, and email sources. Drop custom plugins in ~/.rssany/plugins and tune refresh intervals and proxies in sources.json.",
    },
    {
      question: "Where is data stored?",
      answer:
        "Items live in SQLite via Node's built-in driver, defaulting to ~/.rssany/data/rssany.db. User config under ~/.rssany/ survives package upgrades.",
    },
    {
      question: "Does it support LLM tagging or translation?",
      answer:
        "Yes. Parsing, extraction, tagging, and translation run in the fixed pipeline under app/pipeline/, toggled in config.json with an OpenAI-compatible endpoint.",
    },
    {
      question: "How do I install and run it?",
      answer:
        "Run npm install -g rssany, then rssany and open http://127.0.0.1:18473/. From source: pnpm install, pnpm run build:all, pnpm start.",
    },
  ],
};

export function buildBaseJsonLdGraph(options: {
  siteUrl: string;
  language: AppLanguage;
}): Record<string, unknown> {
  const { siteUrl, language } = options;

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${siteUrl}/#organization`,
        name: SITE_NAME,
        url: siteUrl,
        description: SEO_COPY[language].home.description,
        logo: `${siteUrl}/rssany-light.svg`,
      },
      {
        "@type": "WebSite",
        "@id": `${siteUrl}/#website`,
        url: siteUrl,
        name: SITE_NAME,
        description: SEO_COPY[language].home.description,
        publisher: { "@id": `${siteUrl}/#organization` },
        inLanguage: ["zh-CN", "en"],
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${siteUrl}/#software`,
        name: "rssany",
        applicationCategory: "DeveloperApplication",
        operatingSystem: "Windows, macOS, Linux",
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        description: SEO_COPY[language].home.description,
        url: siteUrl,
        downloadUrl: "https://www.npmjs.com/package/rssany",
        publisher: { "@id": `${siteUrl}/#organization` },
      },
    ],
  };
}

export function buildFaqJsonLd(options: {
  siteUrl: string;
  language: AppLanguage;
}): Record<string, unknown> {
  const { siteUrl, language } = options;
  const faqItems = FAQ_ITEMS[language];

  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "@id": `${siteUrl}/#faq`,
    mainEntity: faqItems.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };
}

export function getHomeTitle(language: AppLanguage): string {
  return SEO_COPY[language].home.title;
}
