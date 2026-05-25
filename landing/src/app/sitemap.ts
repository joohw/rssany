import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { buildSitemapEntries } from "@/lib/seo-data";
import { resolvePublicSiteUrl } from "@/lib/site";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const headerStore = await headers();
  const host =
    headerStore.get("x-forwarded-host") || headerStore.get("host") || undefined;
  const siteUrl = resolvePublicSiteUrl(host);

  return buildSitemapEntries(siteUrl);
}
