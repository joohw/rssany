"use client";

import { useTranslation } from "react-i18next";
import { FAQ_ITEMS } from "@/lib/seo-data";

export function HomeFaq() {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage?.startsWith("en") ? "en" : "zh-CN";
  const items = FAQ_ITEMS[language];

  return (
    <section id="faq" className="relative z-[1] px-4 py-14 sm:px-5 md:py-20">
      <div className="mx-auto max-w-[78rem] border-t border-border px-4 pt-10 sm:px-6 md:pt-14">
        <h2 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
          {language === "en" ? "FAQ" : "常见问题"}
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          {language === "en"
            ? "A few things you may want to know before getting started."
            : "开始使用前，你可能关心的几个问题。"}
        </p>

        <dl className="-mx-4 mt-8 divide-y divide-border border border-border sm:-mx-6">
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
