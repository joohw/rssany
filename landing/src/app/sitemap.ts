import type { MetadataRoute } from "next";
import { buildSitemapEntries } from "@/lib/seo-data";
import { resolvePublicSiteUrl } from "@/lib/site";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = resolvePublicSiteUrl();

  return buildSitemapEntries(siteUrl);
}
