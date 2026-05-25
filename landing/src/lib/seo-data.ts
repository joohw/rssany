import type { AppLanguage } from "@/i18n/config";
import { BLOG_POSTS, blogPathname } from "@/lib/blog-data";
import { GITHUB_URL, NPM_URL, normalizePath, SITE_NAME } from "@/lib/site";

export type SeoPageKey = "home" | "blog";

type SeoCopy = {
  title: string;
  description: string;
  ogImage: string;
  keywords: string[];
};

export const SEO_COPY: Record<AppLanguage, Record<SeoPageKey, SeoCopy>> = {
  "zh-CN": {
    home: {
      title: "定制专属信息源 · 内容生产与资讯管线 · rssany",
      description:
        "RssAny 面向内容生产与资讯工作流，帮你定制网页、RSS、邮件等信源，定时抓取与插件解析后统一入库，再输出 RSS、JSON API 与 MCP，接入创作与分发管线。",
      ogImage: "/use-case-zh.png",
      keywords: [
        "RssAny",
        "RSS",
        "信息源定制",
        "内容生产",
        "资讯管线",
        "自托管",
        "RSS 聚合",
        "订阅管线",
        "JSON API",
        "MCP",
        "开源",
      ],
    },
    blog: {
      title: "博客 · RssAny 信息源定制与内容管线",
      description:
        "RssAny 博客：网页/RSS/邮件信源定制、插件解析、pipeline 加工与 RSS / JSON API / MCP 输出实践。",
      ogImage: "/use-case-zh.png",
      keywords: [
        "RssAny 博客",
        "RSS 聚合",
        "信息源定制",
        "内容管线",
        "自托管",
        "MCP",
        "JSON API",
      ],
    },
  },
  en: {
    home: {
      title: "Curate dedicated feeds for content & news pipelines · rssany",
      description:
        "RssAny helps you curate web, RSS, and email sources for content production and news workflows — fetch, parse, dedupe, enrich, then publish RSS, JSON API, and MCP for editorial tools.",
      ogImage: "/use-case-en.png",
      keywords: [
        "RssAny",
        "RSS",
        "feed aggregator",
        "self-hosted",
        "content pipeline",
        "news workflow",
        "information sources",
        "JSON API",
        "MCP",
        "open source",
      ],
    },
    blog: {
      title: "Blog · RssAny feed curation & content pipelines",
      description:
        "RssAny blog: curating web/RSS/email sources, plugin parsing, pipeline enrichment, and RSS / JSON API / MCP publishing.",
      ogImage: "/use-case-en.png",
      keywords: [
        "RssAny blog",
        "RSS aggregator",
        "feed curation",
        "content pipeline",
        "self-hosted",
        "MCP",
        "JSON API",
      ],
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

export function pathnameForPage(page: SeoPageKey, slugArg?: string): string {
  if (page === "home") return "/";
  if (page === "blog") return slugArg ? `/blog/${slugArg}` : "/blog";
  return "/";
}

export type FaqItem = { question: string; answer: string };

export const FAQ_ITEMS: Record<AppLanguage, FaqItem[]> = {
  "zh-CN": [
    {
      question: "RssAny 是什么？",
      answer:
        "RssAny 是一套自托管的信息源定制与订阅管线，面向内容生产与资讯工作流。它抓取网页列表、标准 RSS、IMAP 邮件等信源，解析与补全文后入库去重，再按需生成 RSS/Atom/JSON Feed、JSON API 与 MCP，供创作与分发流程消费。",
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
        "RssAny is a self-hosted pipeline for curating information sources in content production and news workflows. It fetches web lists, RSS/Atom, and IMAP mail, parses and enriches items, deduplicates into SQLite, then publishes RSS/Atom/JSON feeds, JSON API, and MCP for editorial and distribution tools.",
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
  const copy = SEO_COPY[language].home;
  const faqItems = FAQ_ITEMS[language];

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${siteUrl}/#organization`,
        name: "RssAny",
        alternateName: SITE_NAME,
        url: siteUrl,
        description: copy.description,
        logo: {
          "@type": "ImageObject",
          url: `${siteUrl}/rssany-light.svg`,
        },
        sameAs: [GITHUB_URL, NPM_URL],
      },
      {
        "@type": "WebSite",
        "@id": `${siteUrl}/#website`,
        url: siteUrl,
        name: "RssAny",
        alternateName: SITE_NAME,
        description: copy.description,
        publisher: { "@id": `${siteUrl}/#organization` },
        inLanguage: ["zh-CN", "en"],
      },
      {
        "@type": "WebPage",
        "@id": `${siteUrl}/#webpage`,
        url: siteUrl,
        name: copy.title,
        description: copy.description,
        isPartOf: { "@id": `${siteUrl}/#website` },
        about: { "@id": `${siteUrl}/#software` },
        inLanguage: language,
        primaryImageOfPage: {
          "@type": "ImageObject",
          url: `${siteUrl}${copy.ogImage}`,
        },
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${siteUrl}/#software`,
        name: "RssAny",
        alternateName: SITE_NAME,
        applicationCategory: "BusinessApplication",
        applicationSubCategory: "FeedAggregator",
        operatingSystem: "Windows, macOS, Linux",
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        description: copy.description,
        url: siteUrl,
        downloadUrl: NPM_URL,
        softwareHelp: `${GITHUB_URL}#readme`,
        featureList: [
          language === "zh-CN" ? "定制网页、RSS、邮件等信息源" : "Curate web, RSS, and email sources",
          language === "zh-CN" ? "可插拔信源插件" : "Pluggable source plugins",
          language === "zh-CN" ? "固定 pipeline 打标签与翻译" : "Fixed pipeline for tagging and translation",
          language === "zh-CN" ? "RSS / JSON API / MCP 输出" : "RSS, JSON API, and MCP outputs",
          language === "zh-CN" ? "自托管与 SQLite 本地存储" : "Self-hosted storage with SQLite",
        ],
        publisher: { "@id": `${siteUrl}/#organization` },
      },
      {
        "@type": "FAQPage",
        "@id": `${siteUrl}/#faq`,
        isPartOf: { "@id": `${siteUrl}/#webpage` },
        inLanguage: language,
        mainEntity: faqItems.map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: { "@type": "Answer", text: item.answer },
        })),
      },
    ],
  };
}

export function buildFaqJsonLd(options: {
  siteUrl: string;
  language: AppLanguage;
}): Record<string, unknown> {
  return buildBaseJsonLdGraph(options);
}

export function getHomeTitle(language: AppLanguage): string {
  return SEO_COPY[language].home.title;
}

export function buildSitemapEntries(siteUrl: string, lastModified = new Date()): Array<{
  url: string;
  lastModified: Date;
  changeFrequency: "weekly" | "monthly";
  priority: number;
  alternates: {
    languages: Record<string, string>;
  };
}> {
  const homePath = pathnameForPage("home");
  const blogIndexPath = pathnameForPage("blog");

  const entries: Array<{
    url: string;
    lastModified: Date;
    changeFrequency: "weekly" | "monthly";
    priority: number;
    alternates: { languages: Record<string, string> };
  }> = [
    {
      url: `${siteUrl}${homePath}`,
      lastModified,
      changeFrequency: "weekly",
      priority: 1,
      alternates: {
        languages: {
          "zh-CN": hreflangUrl(siteUrl, homePath, "zh-CN"),
          en: hreflangUrl(siteUrl, homePath, "en"),
          "x-default": hreflangUrl(siteUrl, homePath, "zh-CN"),
        },
      },
    },
    {
      url: `${siteUrl}${blogIndexPath}`,
      lastModified,
      changeFrequency: "weekly",
      priority: 0.88,
      alternates: {
        languages: {
          "zh-CN": hreflangUrl(siteUrl, blogIndexPath, "zh-CN"),
          en: hreflangUrl(siteUrl, blogIndexPath, "en"),
          "x-default": hreflangUrl(siteUrl, blogIndexPath, "zh-CN"),
        },
      },
    },
  ];

  for (const post of BLOG_POSTS) {
    const pathname = blogPathname(post.slug);
    entries.push({
      url: `${siteUrl}${pathname}`,
      lastModified,
      changeFrequency: "monthly",
      priority: post.priority,
      alternates: {
        languages: {
          "zh-CN": hreflangUrl(siteUrl, pathname, "zh-CN"),
          en: hreflangUrl(siteUrl, pathname, "en"),
          "x-default": hreflangUrl(siteUrl, pathname, "zh-CN"),
        },
      },
    });
  }

  return entries;
}
