"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";
import type { AppLanguage } from "@/i18n/config";
import type { BlogPostMeta } from "@/lib/blog-data";

type LocalizedBlogPost = {
  meta: BlogPostMeta;
  html: string;
};

type BlogPostContentProps = {
  postsByLanguage: Record<AppLanguage, LocalizedBlogPost | null>;
};

export function BlogPostContent({ postsByLanguage }: BlogPostContentProps) {
  const { t, i18n } = useTranslation();
  const language: AppLanguage = i18n.resolvedLanguage?.startsWith("en") ? "en" : "zh-CN";
  const post = postsByLanguage[language];

  if (!post) return null;

  return (
    <div className="page-wrap relative">
      <article className="page-content page-content--with-bottom relative z-[1] mx-auto max-w-6xl px-5 sm:px-6">
        <nav className="text-sm text-muted-foreground">
          <Link href="/blog" className="hover:text-foreground">
            {t("blog.indexTitle")}
          </Link>
          <span className="mx-2">/</span>
          <span className="text-foreground">{post.meta.title}</span>
        </nav>

        <header className="mt-6 max-w-3xl">
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{post.meta.title}</h1>
          {post.meta.date ? (
            <time dateTime={post.meta.date} className="mt-3 block text-sm text-muted-foreground">
              {post.meta.date}
            </time>
          ) : null}
          {post.meta.description ? (
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">{post.meta.description}</p>
          ) : null}
        </header>

        <div className="blog-prose mt-10 max-w-3xl" dangerouslySetInnerHTML={{ __html: post.html }} />

        <footer className="mt-12 max-w-3xl border-t border-border/60 pt-6">
          <Link href="/blog" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
            {t("blog.backToBlog")}
          </Link>
          <span className="mx-3 text-muted-foreground">·</span>
          <Link href="/#pipeline" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
            {t("blog.viewPipeline")}
          </Link>
        </footer>
      </article>
    </div>
  );
}
