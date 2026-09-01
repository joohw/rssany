"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";
import { HomeFooter } from "@/components/home/footer";
import { blogPathname, type BlogPostMeta } from "@/lib/blog-data";
import { localizedPath, type AppLanguage } from "@/i18n/config";
import styles from "./blog-index-content.module.css";

type BlogIndexContentProps = {
  language: AppLanguage;
  posts: BlogPostMeta[];
};

export function BlogIndexContent({ language, posts }: BlogIndexContentProps) {
  const { t } = useTranslation();

  return (
    <div className={styles.blogRoot}>
      <main className={styles.blogFrame}>
        <header className={styles.blogHeader}>
          <h1>{t("blog.indexTitle")}</h1>
          <p>{t("blog.indexSubtitle")}</p>
        </header>

        {posts.length === 0 ? (
          <p className={styles.emptyState}>{t("blog.empty")}</p>
        ) : (
          <div className={styles.postList}>
            {posts.map((post, index) => (
              <Link
                key={post.slug}
                href={localizedPath(language, blogPathname(post.slug))}
                className={styles.postRow}
              >
                <div className={styles.postMeta}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  {post.date ? <time dateTime={post.date}>{post.date}</time> : null}
                </div>
                <div className={styles.postCopy}>
                  <h2>{post.title}</h2>
                  {post.description ? <p>{post.description}</p> : null}
                </div>
                <span className={styles.postArrow} aria-hidden="true">↗</span>
              </Link>
            ))}
          </div>
        )}
      </main>
      <HomeFooter />
    </div>
  );
}
