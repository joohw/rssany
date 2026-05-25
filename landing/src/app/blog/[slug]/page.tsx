import { notFound } from "next/navigation";
import { BlogPostContent } from "@/components/blog/blog-post-content";
import { StructuredData } from "@/components/structured-data";
import {
  blogBySlug,
  buildBlogPostingJsonLd,
  BLOG_POSTS,
  getBlogPost,
} from "@/lib/blog-data.server";
import { renderMarkdown } from "@/lib/markdown";
import { buildBlogPostPageMetadata, resolveSeoLanguage, resolveSiteUrl } from "@/lib/seo";

type BlogPostPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateStaticParams() {
  return BLOG_POSTS.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: BlogPostPageProps) {
  const { slug } = await params;
  if (!blogBySlug(slug)) return {};
  return buildBlogPostPageMetadata(slug);
}

export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const { slug } = await params;
  const postDef = blogBySlug(slug);
  if (!postDef) notFound();

  const [siteUrl, language] = await Promise.all([resolveSiteUrl(), resolveSeoLanguage()]);
  if (!getBlogPost(slug, language)) notFound();

  const zhPost = getBlogPost(slug, "zh-CN");
  const enPost = getBlogPost(slug, "en");

  const [zhHtml, enHtml] = await Promise.all([
    zhPost ? renderMarkdown(zhPost.body) : Promise.resolve(""),
    enPost ? renderMarkdown(enPost.body) : Promise.resolve(""),
  ]);

  const jsonLd = buildBlogPostingJsonLd({ siteUrl, language, slug });

  return (
    <>
      <StructuredData data={jsonLd} />
      <BlogPostContent
        postsByLanguage={{
          "zh-CN": zhPost ? { meta: zhPost, html: zhHtml } : null,
          en: enPost ? { meta: enPost, html: enHtml } : null,
        }}
      />
    </>
  );
}
