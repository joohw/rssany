import { BlogIndexContent } from "@/components/blog/blog-index-content";
import { getAllBlogPosts } from "@/lib/blog-data.server";
import { buildPageMetadata } from "@/lib/seo";

export async function generateMetadata() {
  return buildPageMetadata("blog");
}

export default function BlogIndexPage() {
  const postsByLanguage = {
    "zh-CN": getAllBlogPosts("zh-CN"),
    en: getAllBlogPosts("en"),
  };

  return <BlogIndexContent postsByLanguage={postsByLanguage} />;
}
