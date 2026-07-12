import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BlogPostContent } from "@/components/blog/blog-post-content";
import { StructuredData } from "@/components/structured-data";
import { isAppLanguage, SUPPORTED_LANGUAGES } from "@/i18n/config";
import { blogBySlug, buildBlogPostingJsonLd, BLOG_POSTS, getBlogPost } from "@/lib/blog-data.server";
import { renderMarkdown } from "@/lib/markdown";
import { buildBlogPostPageMetadata } from "@/lib/seo";
import { PUBLIC_SITE_URL } from "@/lib/site";

type BlogPostPageProps = { params: Promise<{ lang: string; slug: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return SUPPORTED_LANGUAGES.flatMap((lang) => BLOG_POSTS.map((post) => ({ lang, slug: post.slug })));
}

export async function generateMetadata({ params }: BlogPostPageProps): Promise<Metadata> {
  const { lang, slug } = await params;
  if (!isAppLanguage(lang) || !blogBySlug(slug)) return {};
  return buildBlogPostPageMetadata(slug, lang);
}

export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const { lang, slug } = await params;
  if (!isAppLanguage(lang) || !blogBySlug(slug)) notFound();
  const post = getBlogPost(slug, lang);
  if (!post) notFound();

  const html = await renderMarkdown(post.body);
  const jsonLd = buildBlogPostingJsonLd({ siteUrl: PUBLIC_SITE_URL, language: lang, slug });

  return (
    <>
      <StructuredData data={jsonLd} />
      <BlogPostContent language={lang} post={{ meta: post, html }} />
    </>
  );
}
