"use client";

import { useTranslation } from "react-i18next";
import { GITHUB_URL } from "@/lib/site";
import { localizedPath, type AppLanguage } from "@/i18n/config";

export function HomeFooter() {
  const { t, i18n } = useTranslation();
  const language: AppLanguage = i18n.resolvedLanguage?.startsWith("en") ? "en" : "zh-CN";
  const homePath = localizedPath(language);

  return (
    <footer className="relative z-[1] border-t border-border/40 px-5 py-10 sm:px-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-base font-bold tracking-tight text-foreground">
            <a href={homePath} className="transition-colors hover:text-muted-foreground">
              RSSANY
            </a>
          </p>
          <p className="mt-2 text-xs text-muted-foreground">{t("home.footerTagline")}</p>
          <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            {t("home.footerCopyright")}
          </p>
        </div>

        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <a href={`${homePath}#features`} className="text-muted-foreground hover:text-foreground">
            {t("header.features")}
          </a>
          <a href={`${homePath}#pipeline`} className="text-muted-foreground hover:text-foreground">
            {t("header.pipeline")}
          </a>
          <a href={localizedPath(language, "/blog")} className="text-muted-foreground hover:text-foreground">
            {t("header.blog")}
          </a>
          <a href={`${homePath}#faq`} className="text-muted-foreground hover:text-foreground">
            FAQ
          </a>
          <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground">
            GitHub
          </a>
          <a
            href="https://www.npmjs.com/package/rssany"
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground"
          >
            npm
          </a>
          <a
            href="https://github.com/joohw/rssany/blob/main/docs/plugins.md"
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground"
          >
            {t("header.docs")}
          </a>
        </div>
      </div>
    </footer>
  );
}
