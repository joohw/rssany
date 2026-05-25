"use client";

import { useTranslation } from "react-i18next";
import { actionButtonGridClass } from "@/components/home/client-download-buttons";

const GITHUB_URL = (process.env.NEXT_PUBLIC_GITHUB_URL || "https://github.com/joohw/rssany").trim();
const NPM_URL = "https://www.npmjs.com/package/rssany";
const DOCS_URL = "https://github.com/joohw/rssany/blob/main/README.md";

export function HomeCta() {
  const { t } = useTranslation();

  return (
    <section className="relative z-[1] border-t border-border/40 px-5 py-12 sm:px-6 md:py-16">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">{t("home.ctaTitle")}</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          {t("home.ctaSubtitle")}
        </p>

        <div className="mt-8 grid max-w-2xl grid-cols-2 gap-3">
          <a
            href={NPM_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={actionButtonGridClass}
          >
            {t("home.ctaNpm")}
          </a>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={actionButtonGridClass}
          >
            {t("home.ctaGithub")}
          </a>
          <a
            href={DOCS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={`${actionButtonGridClass} col-span-2`}
          >
            {t("home.viewDocs")}
          </a>
        </div>
      </div>
    </section>
  );
}
