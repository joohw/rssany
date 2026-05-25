import fs from "node:fs";
import path from "node:path";
import type { AppLanguage } from "@/i18n/config";
import {
  BLOG_POSTS,
  blogBySlug,
  blogPathname,
  type BlogPost,
  type BlogPostMeta,
} from "@/lib/blog-data";
import { SITE_NAME } from "@/lib/site";

const BLOG_DIR = path.join(process.cwd(), "content/blog");

function blogFilename(slug: string, language: AppLanguage): string {
  return `${slug}.${language}.md`;
}

function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    return { meta: {}, body: raw.trim() };
  }

  const meta: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim().replace(/^['"]|['"]$/g, "");
    if (key) meta[key] = value;
  }

  return { meta, body: match[2].trim() };
}

function readPostFile(slug: string, language: AppLanguage): BlogPost | null {
  const filename = blogFilename(slug, language);
  const filePath = path.join(BLOG_DIR, filename);
  if (!fs.existsSync(filePath)) return null;

  const raw = fs.readFileSync(filePath, "utf8");
  const { meta, body } = parseFrontmatter(raw);
  const title = meta.title?.trim();
  if (!title) {
    throw new Error(`Blog post "${filename}" is missing required frontmatter field: title`);
  }

  const date = meta.date?.trim() ?? "";
  const lastModified = date ? new Date(`${date}T00:00:00+08:00`) : new Date();

  return {
    slug,
    title,
    description: meta.description?.trim() ?? "",
    date,
    lastModified,
    body,
  };
}

export function getBlogPost(slug: string, language: AppLanguage): BlogPost | null {
  if (!blogBySlug(slug)) return null;
  return readPostFile(slug, language);
}

export function getAllBlogPosts(language: AppLanguage): BlogPostMeta[] {
  return BLOG_POSTS.map((def) => readPostFile(def.slug, language))
    .filter((post): post is BlogPost => post !== null)
    .sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime())
    .map(({ slug, title, description, date, lastModified }) => ({
      slug,
      title,
      description,
      date,
      lastModified,
    }));
}

export function buildBlogPostingJsonLd(options: {
  siteUrl: string;
  language: AppLanguage;
  slug: string;
}): Record<string, unknown> {
  const { siteUrl, language, slug } = options;
  const post = getBlogPost(slug, language);
  if (!post) return {};

  const pageUrl = `${siteUrl}${blogPathname(slug)}`;

  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "@id": `${pageUrl}#article`,
    headline: post.title,
    description: post.description || post.title,
    datePublished: post.date || undefined,
    dateModified: post.date || undefined,
    inLanguage: language,
    url: pageUrl,
    mainEntityOfPage: { "@type": "WebPage", "@id": pageUrl },
    author: { "@type": "Organization", name: SITE_NAME },
    publisher: { "@id": `${siteUrl}/#organization` },
    isPartOf: { "@id": `${siteUrl}/#website` },
  };
}

export { BLOG_POSTS, blogBySlug } from "@/lib/blog-data";
