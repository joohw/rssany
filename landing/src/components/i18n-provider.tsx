"use client";

import { PropsWithChildren, useMemo } from "react";
import { I18nextProvider } from "react-i18next";
import type { AppLanguage } from "@/i18n/config";
import { createI18nInstance } from "@/i18n/instance";

type I18nProviderProps = PropsWithChildren<{
  language: AppLanguage;
}>;

export function I18nProvider({ children, language }: I18nProviderProps) {
  const i18n = useMemo(() => createI18nInstance(language), [language]);

  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}
