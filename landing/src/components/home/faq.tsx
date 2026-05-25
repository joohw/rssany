"use client";

import { useTranslation } from "react-i18next";
import { FAQ_ITEMS } from "@/lib/seo-data";

export function HomeFaq() {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage?.startsWith("en") ? "en" : "zh-CN";
  const items = FAQ_ITEMS[language];

  return (
    <section id="faq" className="relative z-[1] border-t border-border/40 px-5 py-12 sm:px-6 md:py-16">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
          {language === "en" ? "FAQ" : "常见问题"}
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          {language === "en"
            ? "Quick answers about RssAny, sources, storage, and installation."
            : "关于 RssAny、信源类型、数据存储与安装的常见问题。"}
        </p>

        <dl className="mt-8 divide-y divide-border/60 rounded-lg border border-border/60">
          {items.map((item) => (
            <div key={item.question} className="px-5 py-5 sm:px-6">
              <dt className="font-semibold text-foreground">{item.question}</dt>
              <dd className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.answer}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
