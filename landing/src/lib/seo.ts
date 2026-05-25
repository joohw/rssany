import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { LANG_STORAGE_KEY, type AppLanguage } from "@/i18n/config";
import { resolveLanguage } from "@/i18n/resolve-language";
import {
  hreflangUrl,
  pathnameForPage,
  resolvePageCopy,
  type SeoPageKey,
} from "@/lib/seo-data";
import { getPublicSiteUrlFromRequest, normalizePath, SITE_NAME } from "@/lib/site";

export type { FaqItem, SeoPageKey } from "@/lib/seo-data";
export {
  buildBaseJsonLdGraph,
  buildFaqJsonLd,
  buildSitemapEntries,
  FAQ_ITEMS,
  getHomeTitle,
} from "@/lib/seo-data";

export async function resolveSeoLanguage(): Promise<AppLanguage> {
  const cookieStore = await cookies();
  const headerStore = await headers();
  return resolveLanguage({
    cookie: cookieStore.get(LANG_STORAGE_KEY)?.value,
    acceptLanguage: headerStore.get("accept-language"),
  });
}

export async function resolveSiteUrl(): Promise<string> {
  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") || headerStore.get("host") || undefined;
  return getPublicSiteUrlFromRequest(host);
}

export async function buildPageMetadata(page: SeoPageKey): Promise<Metadata> {
  const language = await resolveSeoLanguage();
  const siteUrl = await resolveSiteUrl();
  const pathname = pathnameForPage(page);
  const { title, description, ogImage, keywords } = resolvePageCopy(page, language);

  return buildMetadataFromCopy({ siteUrl, language, pathname, title, description, ogImage, keywords });
}

function buildMetadataFromCopy(options: {
  siteUrl: string;
  language: AppLanguage;
  pathname: string;
  title: string;
  description: string;
  ogImage: string;
  keywords: string[];
}): Metadata {
  const { siteUrl, language, pathname, title, description, ogImage, keywords } = options;
  const canonical = `${siteUrl}${normalizePath(pathname)}`;
  const googleSiteVerification = process.env.GOOGLE_SITE_VERIFICATION?.trim();

  return {
    metadataBase: new URL(siteUrl),
    title,
    description,
    keywords,
    applicationName: "RssAny",
    category: "technology",
    creator: "RssAny",
    publisher: "RssAny",
    formatDetection: {
      email: false,
      address: false,
      telephone: false,
    },
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
        "zh-CN": hreflangUrl(siteUrl, pathname, "zh-CN"),
        en: hreflangUrl(siteUrl, pathname, "en"),
        "x-default": hreflangUrl(siteUrl, pathname, "zh-CN"),
      },
    },
    icons: {
      icon: [
        { url: "/favicon.ico", sizes: "32x32" },
        { url: "/rssany-light.svg", type: "image/svg+xml" },
        { url: "/icon.svg", type: "image/svg+xml" },
      ],
      shortcut: ["/favicon.ico"],
      apple: [{ url: "/rssany-light.svg", type: "image/svg+xml" }],
    },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      title,
      description,
      url: canonical,
      locale: language === "zh-CN" ? "zh_CN" : "en_US",
      alternateLocale: language === "zh-CN" ? ["en_US"] : ["zh_CN"],
      images: [{ url: ogImage, width: 730, height: 731, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
    ...(googleSiteVerification
      ? {
          verification: {
            google: googleSiteVerification,
          },
        }
      : {}),
  };
}
