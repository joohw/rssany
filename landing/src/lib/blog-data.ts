export type BlogPostDef = {
  slug: string;
  priority: number;
  date: string;
};

export const BLOG_POSTS: BlogPostDef[] = [
  { slug: "curate-feeds-for-content-pipeline", priority: 0.85, date: "2026-05-20" },
  { slug: "rssany-plugin-and-source-setup", priority: 0.82, date: "2026-05-22" },
];

export type BlogPostMeta = {
  slug: string;
  title: string;
  description: string;
  date: string;
  lastModified: Date;
};

export type BlogPost = BlogPostMeta & {
  body: string;
};

export function blogBySlug(slug: string): BlogPostDef | undefined {
  return BLOG_POSTS.find((post) => post.slug === slug);
}

export function blogPathname(slug: string): string {
  return `/blog/${slug}`;
}
