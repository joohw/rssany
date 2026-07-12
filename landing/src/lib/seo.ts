import type { Metadata } from "next";
import type { AppLanguage } from "@/i18n/config";
import { localizedPath } from "@/i18n/config";
import { resolvePageCopy, SEO_COPY, type SeoPageKey } from "@/lib/seo-data";
import { getBlogPost } from "@/lib/blog-data.server";
import { blogPathname } from "@/lib/blog-data";
import { normalizePath, PUBLIC_SITE_URL, SITE_NAME } from "@/lib/site";

export type { FaqItem, SeoPageKey } from "@/lib/seo-data";
export {
  buildHomeJsonLdGraph,
  buildSiteJsonLdGraph,
  buildSitemapEntries,
  FAQ_ITEMS,
  getHomeTitle,
} from "@/lib/seo-data";

export function buildPageMetadata(page: SeoPageKey, language: AppLanguage): Metadata {
  const pathname = page === "home" ? "/" : "/blog";
  const { title, description, ogImage, keywords } = resolvePageCopy(page, language);

  return buildMetadataFromCopy({
    language,
    pathname: localizedPath(language, pathname),
    alternatePathname: pathname,
    title,
    description,
    ogImage,
    keywords,
  });
}

export function buildBlogPostPageMetadata(slug: string, language: AppLanguage): Metadata {
  const post = getBlogPost(slug, language);
  if (!post) return {};
  const pathname = blogPathname(slug);
  const { keywords } = resolvePageCopy("blog", language);

  return buildMetadataFromCopy({
    language,
    pathname: localizedPath(language, pathname),
    alternatePathname: pathname,
    title: post.title,
    description: post.description || post.title,
    ogImage: SEO_COPY[language].home.ogImage,
    keywords,
    openGraphType: "article",
    publishedTime: post.date || undefined,
    modifiedTime: post.date || undefined,
  });
}

function buildMetadataFromCopy(options: {
  language: AppLanguage;
  pathname: string;
  alternatePathname: string;
  title: string;
  description: string;
  ogImage: string;
  keywords: string[];
  openGraphType?: "website" | "article";
  publishedTime?: string;
  modifiedTime?: string;
}): Metadata {
  const {
    language,
    pathname,
    alternatePathname,
    title,
    description,
    ogImage,
    keywords,
    openGraphType = "website",
    publishedTime,
    modifiedTime,
  } = options;
  const canonical = `${PUBLIC_SITE_URL}${normalizePath(pathname)}`;
  const googleSiteVerification = process.env.GOOGLE_SITE_VERIFICATION?.trim();

  return {
    metadataBase: new URL(PUBLIC_SITE_URL),
    title,
    description,
    keywords,
    applicationName: "RssAny",
    category: "technology",
    creator: "RssAny",
    publisher: "RssAny",
    formatDetection: { email: false, address: false, telephone: false },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1,
      },
    },
    alternates: {
      canonical,
      languages: {
        "zh-CN": `${PUBLIC_SITE_URL}${localizedPath("zh-CN", alternatePathname)}`,
        en: `${PUBLIC_SITE_URL}${localizedPath("en", alternatePathname)}`,
        "x-default": `${PUBLIC_SITE_URL}${localizedPath("zh-CN", alternatePathname)}`,
      },
    },
    icons: {
      icon: [
        { url: "/rssany.svg", type: "image/svg+xml", media: "(prefers-color-scheme: light)" },
        { url: "/rssany-light.svg", type: "image/svg+xml", media: "(prefers-color-scheme: dark)" },
      ],
      shortcut: "/favicon.ico",
      apple: [{ url: "/rssany.svg", type: "image/svg+xml" }],
    },
    openGraph: {
      type: openGraphType,
      siteName: SITE_NAME,
      title,
      description,
      url: canonical,
      locale: language === "zh-CN" ? "zh_CN" : "en_US",
      alternateLocale: language === "zh-CN" ? ["en_US"] : ["zh_CN"],
      images: [{ url: ogImage, width: 730, height: 731, alt: title }],
      ...(publishedTime ? { publishedTime } : {}),
      ...(modifiedTime ? { modifiedTime } : {}),
    },
    twitter: { card: "summary_large_image", title, description, images: [ogImage] },
    ...(googleSiteVerification ? { verification: { google: googleSiteVerification } } : {}),
  };
}
