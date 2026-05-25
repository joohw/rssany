"use client";

import { PropsWithChildren, useEffect, useMemo } from "react";
import { I18nextProvider } from "react-i18next";
import { LANG_STORAGE_KEY, type AppLanguage } from "@/i18n/config";
import { createI18nInstance } from "@/i18n/instance";
import { buildLanguageCookie, normalizeLanguage } from "@/i18n/resolve-language";

type I18nProviderProps = PropsWithChildren<{
  language: AppLanguage;
}>;

function persistLanguage(language: AppLanguage) {
  if (typeof document === "undefined") return;

  document.documentElement.lang = language;
  document.cookie = buildLanguageCookie(language);
  localStorage.setItem(LANG_STORAGE_KEY, language);
}

export function I18nProvider({ children, language }: I18nProviderProps) {
  const i18n = useMemo(() => createI18nInstance(language), [language]);

  useEffect(() => {
    const stored = normalizeLanguage(localStorage.getItem(LANG_STORAGE_KEY));
    if (stored && stored !== i18n.language) {
      void i18n.changeLanguage(stored);
      return;
    }

    persistLanguage(normalizeLanguage(i18n.language) ?? language);

    const handleLanguageChanged = (nextLanguage: string) => {
      persistLanguage(nextLanguage as AppLanguage);
    };

    i18n.on("languageChanged", handleLanguageChanged);
    return () => {
      i18n.off("languageChanged", handleLanguageChanged);
    };
  }, [i18n, language]);

  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}
