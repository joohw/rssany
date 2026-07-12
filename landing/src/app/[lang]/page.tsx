import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HomeApiStyles } from "@/components/home/api-styles";
import { HomeCta } from "@/components/home/cta";
import { HomeFaq } from "@/components/home/faq";
import { HomeFeatures } from "@/components/home/features";
import { HomeFooter } from "@/components/home/footer";
import { HomeHero } from "@/components/home/hero";
import { LandingBackdrop } from "@/components/home/landing-backdrop";
import { StructuredData } from "@/components/structured-data";
import { isAppLanguage } from "@/i18n/config";
import { buildHomeJsonLdGraph, buildPageMetadata } from "@/lib/seo";
import { PUBLIC_SITE_URL } from "@/lib/site";
import styles from "../page.module.css";

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
    <div className={`page-wrap ${styles.home} relative`}>
      <StructuredData data={jsonLd} />
      <LandingBackdrop />
      <div className="relative z-[1] w-full min-w-0">
        <HomeHero />
        <HomeFeatures />
        <HomeApiStyles />
        <HomeFaq />
        <HomeCta />
        <HomeFooter />
      </div>
    </div>
  );
}
