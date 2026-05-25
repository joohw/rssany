"use client";

import { useEffect } from "react";
import Image from "next/image";
import { useTranslation } from "react-i18next";
import { ClientDownloadButtons } from "@/components/home/client-download-buttons";
import { ShellHighlight } from "@/components/shell-highlight";
import { useToast } from "@/components/ui/toast-provider";
import { getUseCaseImage } from "@/lib/assets";
import { getHomeTitle } from "@/lib/seo-data";
import styles from "@/app/page.module.css";

const WORKFLOW_LINES = [
  { prompt: true, text: "npm install -g rssany" },
  { prompt: true, text: "rssany" },
  { prompt: false, text: "# open http://127.0.0.1:18473/" },
] as const;

export function HomeHero() {
  const { t, i18n } = useTranslation();
  const { showError, showSuccess } = useToast();
  const useCaseImage = getUseCaseImage(i18n.language);

  useEffect(() => {
    const language = i18n.resolvedLanguage?.startsWith("en") ? "en" : "zh-CN";
    document.title = getHomeTitle(language);
  }, [i18n.language, i18n.resolvedLanguage]);

  async function copyWorkflow() {
    const text = WORKFLOW_LINES.map((line) => (line.prompt ? `$ ${line.text}` : line.text)).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      showSuccess(t("home.copySuccess"));
    } catch {
      showError(t("home.copyFailed"));
    }
  }

  return (
    <section className="relative z-[1] px-5 pb-14 pt-16 sm:px-6 sm:pb-20 sm:pt-20 md:pb-24 md:pt-28 lg:pt-32">
      <div className="mx-auto max-w-6xl">
        <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-2 lg:gap-14">
          <div className="min-w-0 max-w-xl lg:max-w-none">
            <h1 className="text-balance text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
              {t("home.title")}
            </h1>

            <p className="mt-4 text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
              {t("home.subtitle")}
            </p>

            <ClientDownloadButtons className="mt-6" />

            <div className={`${styles.terminalCard} mt-8`}>
              <div className={styles.terminalHeader}>
                <div className="flex gap-1.5" aria-hidden>
                  <span className={styles.terminalDot} />
                  <span className={styles.terminalDot} />
                  <span className={styles.terminalDot} />
                </div>
                <span className="ml-2 text-xs text-muted-foreground">{t("home.quickStart")}</span>
                <button
                  type="button"
                  className="ml-auto rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                  onClick={() => void copyWorkflow()}
                >
                  {t("home.copy")}
                </button>
              </div>

              <div className="space-y-1.5 p-4 font-mono text-sm leading-relaxed sm:p-5 sm:text-[0.95rem]">
                {WORKFLOW_LINES.map((line) => (
                  <div key={line.text} className="flex gap-2">
                    {line.prompt ? (
                      <>
                        <span className="shrink-0 text-foreground/70">$</span>
                        <ShellHighlight
                          code={line.text}
                          className="min-w-0 break-all text-foreground [&_pre]:whitespace-pre-wrap [&_pre]:break-all"
                        />
                      </>
                    ) : (
                      <ShellHighlight
                        code={line.text}
                        className="min-w-0 break-all text-muted-foreground [&_pre]:whitespace-pre-wrap [&_pre]:break-all"
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>

            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{t("home.quickStartHint")}</p>
          </div>

          <div className={`${styles.useCaseShot} min-w-0 w-full`}>
            <Image
              key={useCaseImage.src}
              src={useCaseImage.src}
              alt={t("home.useCaseAlt")}
              width={useCaseImage.width}
              height={useCaseImage.height}
              priority
              unoptimized
              sizes="(min-width: 1024px) 42vw, 100vw"
              className="h-auto w-full"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
