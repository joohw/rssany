import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { getPublicSiteUrlFromRequest } from "@/lib/site";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const headerStore = await headers();
  const host =
    headerStore.get("x-forwarded-host") || headerStore.get("host") || undefined;
  const siteUrl = getPublicSiteUrlFromRequest(host);
  const lastModified = new Date();

  return [{ url: `${siteUrl}/`, changeFrequency: "weekly", priority: 1, lastModified }];
}
