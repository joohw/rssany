"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { applyThemeMode, initThemeMode, persistThemeMode, type ThemeMode } from "@/lib/theme";
import { cn } from "@/lib/utils";

type HeaderLink = { text: string; to: string; hash?: string };

function normalizePath(path: string) {
  if (!path) return "/";
  if (path.length > 1 && path.endsWith("/")) return path.slice(0, -1);
  return path;
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
  const [theme, setTheme] = useState<ThemeMode>("light");

  useEffect(() => {
    setTheme(initThemeMode());
  }, []);

  const headerLinks = useMemo<HeaderLink[]>(() => {
    return [
      { text: t("header.home"), to: "/" },
      { text: t("header.features"), to: "/#features" },
      { text: t("header.pipeline"), to: "/#pipeline" },
      { text: t("header.blog"), to: "/blog" },
      { text: t("header.docs"), to: "https://github.com/joohw/rssany#readme" },
    ];
  }, [t]);

  const githubUrl = (process.env.NEXT_PUBLIC_GITHUB_URL || "https://github.com/joohw/rssany").trim();
  const isEnglish = i18n.resolvedLanguage?.toLowerCase().startsWith("en");

  function toggleTheme() {
    const nextTheme: ThemeMode = theme === "dark" ? "light" : "dark";
    applyThemeMode(nextTheme);
    persistThemeMode(nextTheme);
    setTheme(nextTheme);
  }

  async function toggleLanguage() {
    await i18n.changeLanguage(isEnglish ? "zh-CN" : "en");
  }

  function navLinkClass(active: boolean) {
    return cn(
      "relative rounded-md px-2.5 py-1.5 text-sm font-medium",
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
    <header className="fixed top-0 left-0 right-0 z-40 border-b border-border/60 bg-background/95 backdrop-blur-md supports-[backdrop-filter]:bg-background/85">
      <div className="flex w-full items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-5 sm:gap-6">
          <Link
            href="/"
            className="inline-flex items-center rounded-md opacity-[0.72] motion-safe:transition-[opacity,transform] motion-safe:duration-300 motion-safe:ease-out hover:opacity-100 hover:scale-[1.06] active:scale-[1.02] motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            aria-label={t("header.backHome")}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={theme === "dark" ? "/rssany.svg" : "/rssany-light.svg"} alt="" className="h-[1.35rem] w-[1.35rem]" />
          </Link>
          <nav className="flex min-w-0 flex-1 items-center justify-start gap-1 overflow-x-auto whitespace-nowrap">
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
            href={githubUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t("header.github")}
            title={t("header.github")}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-card text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4 fill-current">
              <path d="M12 1.5a10.5 10.5 0 0 0-3.32 20.46c.52.1.71-.22.71-.5v-1.78c-2.9.63-3.51-1.23-3.51-1.23-.47-1.2-1.16-1.52-1.16-1.52-.95-.64.07-.63.07-.63 1.06.08 1.61 1.09 1.61 1.09.93 1.6 2.44 1.14 3.03.87.1-.68.36-1.14.65-1.4-2.32-.26-4.75-1.16-4.75-5.17 0-1.14.4-2.08 1.09-2.82-.11-.27-.47-1.35.1-2.81 0 0 .88-.28 2.9 1.08a9.99 9.99 0 0 1 5.29 0c2.02-1.36 2.9-1.08 2.9-1.08.57 1.46.21 2.54.1 2.81.68.74 1.09 1.68 1.09 2.82 0 4.02-2.44 4.9-4.77 5.16.37.32.7.93.7 1.88v2.8c0 .28.18.61.72.5A10.5 10.5 0 0 0 12 1.5Z" />
            </svg>
          </a>
          <button
            type="button"
            className="inline-flex h-8 items-center justify-center rounded-md border border-border bg-card px-2 text-xs font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            onClick={() => void toggleLanguage()}
            aria-label={t("header.language")}
            title={isEnglish ? t("header.switchToZh") : t("header.switchToEn")}
          >
            {isEnglish ? "中" : "EN"}
          </button>
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-card text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? t("header.switchToLight") : t("header.switchToDark")}
            title={theme === "dark" ? t("header.switchToLight") : t("header.switchToDark")}
          >
            {theme === "dark" ? "☀" : "☾"}
          </button>
        </div>
      </div>
    </header>
  );
}
