"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { GITHUB_URL, NPM_URL } from "@/lib/site";
import { localizedPath } from "@/i18n/config";
import { cn } from "@/lib/utils";

type HeaderLink = { text: string; to: string; hash?: string };

function normalizePath(path: string) {
  const pathname = path.split("#")[0] || "/";
  if (pathname.length > 1 && pathname.endsWith("/")) return pathname.slice(0, -1);
  return pathname;
}

function isNavActive(currentPath: string, href: string): boolean {
  const p = normalizePath(currentPath);
  const t = normalizePath(href);
  if (t === "/") return p === "/";
  return p === t || p.startsWith(`${t}/`);
}

export function SiteHeader() {
  const pathname = usePathname();
  const { t, i18n } = useTranslation();

  const isEnglish = i18n.resolvedLanguage?.toLowerCase().startsWith("en");

  const headerLinks = useMemo<HeaderLink[]>(() => {
    return [
      { text: t("header.home"), to: localizedPath(isEnglish ? "en" : "zh-CN") },
      { text: t("header.features"), to: `${localizedPath(isEnglish ? "en" : "zh-CN")}#features` },
      { text: t("header.pipeline"), to: `${localizedPath(isEnglish ? "en" : "zh-CN")}#pipeline` },
      { text: t("header.blog"), to: localizedPath(isEnglish ? "en" : "zh-CN", "/blog") },
      { text: t("header.github"), to: GITHUB_URL },
    ];
  }, [isEnglish, t]);

  function navLinkClass(active: boolean) {
    return cn(
      "relative rounded-md px-2.5 py-1.5 font-mono text-[13px] font-medium",
      "motion-safe:transition-[color,opacity] motion-safe:duration-300 motion-safe:ease-out",
      "motion-reduce:transition-none",
      active
        ? "font-semibold text-foreground opacity-100"
        : cn(
            "text-muted-foreground opacity-[0.62]",
            "hover:text-foreground hover:opacity-100",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            "focus-visible:text-foreground focus-visible:opacity-100"
          )
    );
  }

  return (
    <header className="fixed top-0 left-0 right-0 z-40 bg-background/95 backdrop-blur-md supports-[backdrop-filter]:bg-background/85">
      <div className="header-frame mx-auto flex h-[var(--app-header-height)] items-center justify-between gap-3 px-5">
        <div className="flex min-w-0 flex-1 items-center gap-5 sm:gap-6">
          <Link
            href={localizedPath(isEnglish ? "en" : "zh-CN")}
            className="inline-flex items-center rounded-sm opacity-90 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            aria-label={t("header.backHome")}
          >
            <span className="header-wordmark" aria-hidden="true">rssany</span>
          </Link>
          <nav className="flex min-w-0 flex-1 items-center justify-start gap-1 overflow-x-auto whitespace-nowrap sm:justify-end">
            {headerLinks.map((link) =>
              link.to.startsWith("http") ? (
                <a
                  key={link.to}
                  href={link.to}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={navLinkClass(false)}
                >
                  {link.text}
                </a>
              ) : (
                <Link key={link.to} href={link.to} className={navLinkClass(isNavActive(pathname, link.to))}>
                  {link.text}
                </Link>
              )
            )}
          </nav>
        </div>
        <div className="relative inline-flex items-center gap-2">
          <a
            href={NPM_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="header-download-button inline-flex h-9 items-center justify-center rounded-md bg-foreground px-4 font-mono text-[13px] font-semibold transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {t("header.download")}
          </a>
        </div>
      </div>
    </header>
  );
}
