import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BlogIndexContent } from "@/components/blog/blog-index-content";
import { StructuredData } from "@/components/structured-data";
import { isAppLanguage } from "@/i18n/config";
import { buildBlogIndexJsonLd, getAllBlogPosts } from "@/lib/blog-data.server";
import { buildPageMetadata } from "@/lib/seo";
import { PUBLIC_SITE_URL } from "@/lib/site";

type BlogIndexPageProps = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: BlogIndexPageProps): Promise<Metadata> {
  const { lang } = await params;
  if (!isAppLanguage(lang)) return {};
  return buildPageMetadata("blog", lang);
}

export default async function BlogIndexPage({ params }: BlogIndexPageProps) {
  const { lang } = await params;
  if (!isAppLanguage(lang)) notFound();
  const posts = getAllBlogPosts(lang);
  const jsonLd = buildBlogIndexJsonLd({ siteUrl: PUBLIC_SITE_URL, language: lang });

  return (
    <>
      <StructuredData data={jsonLd} />
      <BlogIndexContent language={lang} posts={posts} />
    </>
  );
}
