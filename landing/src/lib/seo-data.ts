import type { AppLanguage } from "@/i18n/config";
import { localizedPath, SUPPORTED_LANGUAGES } from "@/i18n/config";
import { BLOG_POSTS, blogPathname } from "@/lib/blog-data";
import { GITHUB_URL, NPM_URL, SITE_NAME } from "@/lib/site";

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
      title: "rssany - 定制专属信息源",
      description:
        "RssAny 面向内容生产与资讯工作流，帮你定制网页、RSS、邮件等信源，定时抓取与采集器解析后统一入库，再输出 RSS、JSON API 与 MCP，接入创作与分发管线。",
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
        "RssAny 博客：网页/RSS/邮件信源定制、采集器解析、pipeline 加工与 RSS / JSON API / MCP 输出实践。",
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
        "RssAny blog: curating web/RSS/email sources, collector parsing, pipeline enrichment, and RSS / JSON API / MCP publishing.",
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

export function resolvePageCopy(page: SeoPageKey, language: AppLanguage): SeoCopy {
  return SEO_COPY[language][page];
}

export type FaqItem = { question: string; answer: string };

export const FAQ_ITEMS: Record<AppLanguage, FaqItem[]> = {
  "zh-CN": [
    {
      question: "RssAny 和普通 RSS 阅读器有什么不同？",
      answer:
        "RssAny 不只是阅读 RSS，而是帮你持续收集网页、订阅源和邮件中的内容，经过整理后再提供给阅读器、创作工具或自动化流程。",
    },
    {
      question: "没有 RSS 的网站也能订阅吗？",
      answer:
        "可以。RssAny 可以从网页中提取更新内容，也支持标准订阅源和邮件。常用站点可以直接接入，其他网站也能按需扩展。",
    },
    {
      question: "RssAny 可以自动整理内容吗？",
      answer:
        "可以。它能自动提取正文、去除重复内容，并按需要完成分类、打标签、翻译和质量筛选。",
    },
    {
      question: "使用这些功能必须配置 AI 吗？",
      answer:
        "不需要。内容采集、去重、存储和订阅输出都可以独立运行。AI 是可选能力，可用于辅助正文提取、标签生成和翻译。",
    },
    {
      question: "内容多久更新一次？",
      answer:
        "每个信源都可以设置自己的更新频率。RssAny 会持续检查新内容，实际更新时间也会受到目标网站响应速度和访问限制影响。",
    },
    {
      question: "数据存在哪里？会上传到第三方吗？",
      answer:
        "RssAny 运行在你自己的设备或服务器上，内容和设置默认由你掌控。RssAny 本身不提供云端存储；只有主动启用外部 AI 或投递服务时，相关内容才会发送到你配置的服务。",
    },
  ],
  en: [
    {
      question: "How is RssAny different from a regular RSS reader?",
      answer:
        "RssAny does more than read RSS. It continuously collects content from websites, feeds, and email, organizes it, then makes it available to readers, creative tools, and automated workflows.",
    },
    {
      question: "Can I follow websites that do not offer RSS?",
      answer:
        "Yes. RssAny can extract updates from web pages and also supports standard feeds and email. Popular websites work out of the box, and other sources can be added as needed.",
    },
    {
      question: "Can RssAny organize content automatically?",
      answer:
        "Yes. It can extract full text, remove duplicates, and apply optional categorization, tagging, translation, and quality filtering.",
    },
    {
      question: "Is AI required?",
      answer:
        "No. Collection, deduplication, storage, and feed publishing work without AI. AI is optional and can assist with text extraction, tagging, and translation.",
    },
    {
      question: "How often is content updated?",
      answer:
        "Each source can have its own refresh schedule. RssAny checks continuously, while actual timing may also depend on the source website's speed and access restrictions.",
    },
    {
      question: "Where is my data stored, and is it sent to third parties?",
      answer:
        "RssAny runs on your own device or server, so your content and settings stay under your control. RssAny does not provide cloud storage; content is sent elsewhere only when you enable an external AI or delivery service.",
    },
  ],
};

export function buildSiteJsonLdGraph(options: {
  siteUrl: string;
  language: AppLanguage;
}): Record<string, unknown> {
  const { siteUrl, language } = options;
  const copy = SEO_COPY[language].home;

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
          url: `${siteUrl}/rssany.svg`,
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
    ],
  };
}

export function buildHomeJsonLdGraph(options: {
  siteUrl: string;
  language: AppLanguage;
}): Record<string, unknown> {
  const { siteUrl, language } = options;
  const copy = SEO_COPY[language].home;
  const pageUrl = `${siteUrl}${localizedPath(language)}`;
  const faqItems = FAQ_ITEMS[language];

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${pageUrl}#webpage`,
        url: pageUrl,
        name: copy.title,
        description: copy.description,
        isPartOf: { "@id": `${siteUrl}/#website` },
        about: { "@id": `${siteUrl}/#software` },
        inLanguage: language,
        primaryImageOfPage: { "@type": "ImageObject", url: `${siteUrl}${copy.ogImage}` },
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
        url: pageUrl,
        downloadUrl: NPM_URL,
        softwareHelp: `${GITHUB_URL}#readme`,
        featureList: [
          language === "zh-CN" ? "定制网页、RSS、邮件等信息源" : "Curate web, RSS, and email sources",
          language === "zh-CN" ? "可插拔信源采集器" : "Pluggable source collectors",
          language === "zh-CN" ? "固定 pipeline 打标签与翻译" : "Fixed pipeline for tagging and translation",
          language === "zh-CN" ? "RSS / JSON API / MCP 输出" : "RSS, JSON API, and MCP outputs",
          language === "zh-CN" ? "自托管与 SQLite 本地存储" : "Self-hosted storage with SQLite",
        ],
        publisher: { "@id": `${siteUrl}/#organization` },
      },
      {
        "@type": "FAQPage",
        "@id": `${pageUrl}#faq`,
        isPartOf: { "@id": `${pageUrl}#webpage` },
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

export function getHomeTitle(language: AppLanguage): string {
  return SEO_COPY[language].home.title;
}

export function buildSitemapEntries(siteUrl: string): Array<{
  url: string;
  lastModified: Date;
  changeFrequency: "weekly" | "monthly";
  priority: number;
  alternates: {
    languages: Record<string, string>;
  };
}> {
  const landingLastModified = new Date("2026-07-12T00:00:00+08:00");
  const alternatesFor = (pathname: string) => ({
    languages: {
      "zh-CN": `${siteUrl}${localizedPath("zh-CN", pathname)}`,
      en: `${siteUrl}${localizedPath("en", pathname)}`,
      "x-default": `${siteUrl}${localizedPath("zh-CN", pathname)}`,
    },
  });

  const entries: Array<{
    url: string;
    lastModified: Date;
    changeFrequency: "weekly" | "monthly";
    priority: number;
    alternates: { languages: Record<string, string> };
  }> = [];

  for (const language of SUPPORTED_LANGUAGES) {
    entries.push(
      {
        url: `${siteUrl}${localizedPath(language)}`,
        lastModified: landingLastModified,
        changeFrequency: "weekly",
        priority: 1,
        alternates: alternatesFor("/"),
      },
      {
        url: `${siteUrl}${localizedPath(language, "/blog")}`,
        lastModified: landingLastModified,
        changeFrequency: "weekly",
        priority: 0.88,
        alternates: alternatesFor("/blog"),
      },
    );

    for (const post of BLOG_POSTS) {
      const pathname = blogPathname(post.slug);
      entries.push({
        url: `${siteUrl}${localizedPath(language, pathname)}`,
        lastModified: new Date(`${post.date}T00:00:00+08:00`),
        changeFrequency: "monthly",
        priority: post.priority,
        alternates: alternatesFor(pathname),
      });
    }
  }

  return entries;
}
