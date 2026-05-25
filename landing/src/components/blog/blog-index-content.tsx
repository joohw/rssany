"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";
import type { AppLanguage } from "@/i18n/config";
import { blogPathname, type BlogPostMeta } from "@/lib/blog-data";

type BlogIndexContentProps = {
  postsByLanguage: Record<AppLanguage, BlogPostMeta[]>;
};

export function BlogIndexContent({ postsByLanguage }: BlogIndexContentProps) {
  const { t, i18n } = useTranslation();
  const language: AppLanguage = i18n.resolvedLanguage?.startsWith("en") ? "en" : "zh-CN";
  const posts = postsByLanguage[language];

  return (
    <div className="page-wrap relative">
      <div className="page-content page-content--with-bottom relative z-[1] mx-auto max-w-6xl px-5 sm:px-6">
        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{t("blog.indexTitle")}</h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted-foreground">{t("blog.indexSubtitle")}</p>

        {posts.length === 0 ? (
          <p className="mt-10 text-sm text-muted-foreground">{t("blog.empty")}</p>
        ) : (
          <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {posts.map((post) => (
              <Link
                key={post.slug}
                href={blogPathname(post.slug)}
                className="group rounded-lg border border-border/60 bg-background p-5 transition-colors hover:border-border hover:bg-muted/20"
              >
                {post.date ? (
                  <time dateTime={post.date} className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {post.date}
                  </time>
                ) : null}
                <h2 className="mt-2 font-semibold text-foreground group-hover:underline">{post.title}</h2>
                {post.description ? (
                  <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted-foreground">{post.description}</p>
                ) : null}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
