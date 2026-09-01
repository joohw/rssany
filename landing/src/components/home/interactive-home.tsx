"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useTranslation } from "react-i18next";
import { HomeFaq } from "@/components/home/faq";
import { HomeFooter } from "@/components/home/footer";
import { GITHUB_URL, NPM_URL } from "@/lib/site";
import styles from "./interactive-home.module.css";

gsap.registerPlugin(ScrollTrigger);

const FEATURE_KEYS = ["sources", "collectors", "pipeline", "llm", "output", "selfhost"] as const;
const FEATURE_META = ["多源订阅", "按需扩展", "灵活加工", "智能辅助", "多端输出", "本地掌控"] as const;
const INSTALL_COMMANDS = {
  npm: "npm install -g rssany",
  start: "rssany start",
  stop: "rssany stop",
} as const;

type InstallCommand = keyof typeof INSTALL_COMMANDS;

export function InteractiveHome() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [activeCommand, setActiveCommand] = useState<InstallCommand>("npm");
  const [copied, setCopied] = useState(false);
  const { t, i18n } = useTranslation();
  const isEnglish = i18n.resolvedLanguage?.startsWith("en");
  const copy = isEnglish
    ? {
        announcement: "Open source · self-hosted · local-first",
        announcementLink: "View on GitHub",
        commandLabel: "Install, start, and keep it yours.",
        copyCommand: "Copy command",
        copied: "Copied",
        storyTitle: "One small runtime for every source.",
        storyBody: "Scroll through the path an item takes. Every step stays inspectable, replaceable, and on infrastructure you control.",
        stages: [
          {
            index: "01",
            title: "Collect from where information already lives.",
            body: "Schedule web lists, RSS or Atom feeds, and email inboxes. Add authentication only where a source requires it.",
            meta: "WEB · RSS / ATOM · IMAP",
          },
          {
            index: "02",
            title: "Make every item consistent and useful.",
            body: "Normalize, deduplicate, extract full text, then run optional tagging and translation before storing it in SQLite.",
            meta: "DEDUPE · EXTRACT · ENRICH",
          },
          {
            index: "03",
            title: "Publish one library in several forms.",
            body: "Expose the same clean item store as RSS XML, JSON API, or MCP for readers, agents, and downstream workflows.",
            meta: "RSS XML · JSON API · MCP",
          },
        ],
        launchTitle: "Your intake. Your rules. Your archive.",
        launchBody: "RssAny keeps the full information pipeline close enough to understand and simple enough to operate.",
        npm: "npm package",
        github: "Source code",
      }
    : {
        announcement: t("home.features.selfhost.title"),
        announcementLink: t("header.github"),
        commandLabel: t("home.quickStart"),
        copyCommand: t("home.copy"),
        copied: t("home.copySuccess"),
        storyTitle: t("home.pipelineTitle"),
        storyBody: t("home.pipelineSubtitle"),
        stages: [
          {
            index: "01",
            title: t("home.pipelineItems.fetch.title"),
            body: t("home.pipelineItems.fetch.description"),
            meta: "网页 · 订阅源 · 邮件",
          },
          {
            index: "02",
            title: t("home.pipelineItems.process.title"),
            body: t("home.pipelineItems.process.description"),
            meta: "标签 · 翻译 · 过滤",
          },
          {
            index: "03",
            title: t("home.pipelineItems.upsert.title"),
            body: t("home.pipelineItems.upsert.description"),
            meta: "去重 · 归档 · 订阅",
          },
        ],
        launchTitle: t("home.ctaTitle"),
        launchBody: t("home.ctaSubtitle"),
        npm: t("home.ctaNpm"),
        github: t("home.ctaGithub"),
      };

  useLayoutEffect(() => {
    if (!rootRef.current) return;

    const media = gsap.matchMedia();
    const context = gsap.context(() => {
      media.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.from("[data-hero-reveal]", {
          autoAlpha: 0,
          y: 18,
          duration: 0.72,
          stagger: 0.075,
          ease: "power3.out",
        });

        ScrollTrigger.batch("[data-feature-card]", {
          start: "top 90%",
          once: true,
          interval: 0.06,
          batchMax: 3,
          onEnter: (elements) =>
            gsap.fromTo(
              elements,
              { autoAlpha: 0, y: 22 },
              { autoAlpha: 1, y: 0, duration: 0.55, stagger: 0.06, ease: "power3.out", overwrite: true },
            ),
        });
      });

    }, rootRef);

    const refresh = () => ScrollTrigger.refresh();
    document.fonts?.ready.then(refresh);

    return () => {
      media.revert();
      context.revert();
    };
  }, []);

  async function copyCommand() {
    try {
      await navigator.clipboard.writeText(INSTALL_COMMANDS[activeCommand]);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div ref={rootRef} className={styles.homeRoot}>
      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className={styles.announcement} data-hero-reveal>
            <span>{copy.announcement}</span>
            <span>{copy.announcementLink} ↗</span>
          </a>

          <div className={styles.heroCopy}>
            <h1 data-hero-reveal>{t("home.title")}</h1>
            <p data-hero-reveal>{t("home.subtitle")}</p>
          </div>

          <div className={styles.installPanel} data-hero-reveal>
            <div className={styles.installTabs} role="tablist" aria-label={copy.commandLabel}>
              {(Object.keys(INSTALL_COMMANDS) as InstallCommand[]).map((command) => (
                <button
                  key={command}
                  type="button"
                  role="tab"
                  aria-selected={activeCommand === command}
                  className={activeCommand === command ? styles.installTabActive : undefined}
                  onClick={() => {
                    setActiveCommand(command);
                    setCopied(false);
                  }}
                >
                  {command}
                </button>
              ))}
            </div>
            <div className={styles.installCommand}>
              <code>{INSTALL_COMMANDS[activeCommand]}</code>
              <button type="button" onClick={() => void copyCommand()} aria-label={copy.copyCommand}>
                {copied ? copy.copied : copy.copyCommand}
              </button>
            </div>
          </div>

        </div>
      </section>

      <section id="pipeline" className={styles.story}>
        <div className={styles.storyInner}>
          <div className={styles.storyHeader}>
            <div className={styles.storyIntro}>
              <h2>{copy.storyTitle}</h2>
              <p>{copy.storyBody}</p>
            </div>
          </div>

          <div className={styles.storyStageList}>
            {copy.stages.map((stage) => (
              <article key={stage.index} className={styles.storyRow}>
                <div className={styles.storyRowMeta}>
                  <span className={styles.stageIndex}>{stage.index}</span>
                  <span className={styles.stageMeta}>{stage.meta}</span>
                </div>
                <h3>{stage.title}</h3>
                <p>{stage.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="features" className={styles.capabilities}>
        <div className={styles.sectionHeading}>
          <h2>{t("home.featuresTitle")}</h2>
          <p>{t("home.featuresSubtitle")}</p>
        </div>

        <div className={styles.featureGrid}>
          {FEATURE_KEYS.map((key, index) => (
            <article key={key} className={styles.featureCard} data-feature-card>
              <div className={styles.featureMeta}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <code>{FEATURE_META[index]}</code>
              </div>
              <h3>{t(`home.features.${key}.title`)}</h3>
              <p>{t(`home.features.${key}.description`)}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.launchSection}>
        <div className={styles.launchCopy}>
          <h2>{copy.launchTitle}</h2>
          <p>{copy.launchBody}</p>
          <div>
            <a href={NPM_URL} target="_blank" rel="noopener noreferrer">{copy.npm} ↗</a>
            <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">{copy.github} ↗</a>
          </div>
        </div>
      </section>

      <HomeFaq />
      <HomeFooter />
    </div>
  );
}
