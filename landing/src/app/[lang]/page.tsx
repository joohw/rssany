import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { InteractiveHome } from "@/components/home/interactive-home";
import { StructuredData } from "@/components/structured-data";
import { isAppLanguage } from "@/i18n/config";
import { buildHomeJsonLdGraph, buildPageMetadata } from "@/lib/seo";
import { PUBLIC_SITE_URL } from "@/lib/site";

type LanguagePageProps = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: LanguagePageProps): Promise<Metadata> {
  const { lang } = await params;
  if (!isAppLanguage(lang)) return {};
  return buildPageMetadata("home", lang);
}

export default async function HomePage({ params }: LanguagePageProps) {
  const { lang } = await params;
  if (!isAppLanguage(lang)) notFound();
  const jsonLd = buildHomeJsonLdGraph({ siteUrl: PUBLIC_SITE_URL, language: lang });

  return (
    <div className="page-wrap relative">
      <StructuredData data={jsonLd} />
      <InteractiveHome />
    </div>
  );
}
