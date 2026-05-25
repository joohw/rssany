import { createInstance, type i18n as I18nInstance } from "i18next";
import { initReactI18next } from "react-i18next";
import { DEFAULT_LANGUAGE, resources, SUPPORTED_LANGUAGES, type AppLanguage } from "@/i18n/config";

export function createI18nInstance(language: AppLanguage): I18nInstance {
  const instance = createInstance();

  instance.use(initReactI18next).init({
    lng: language,
    resources,
    fallbackLng: DEFAULT_LANGUAGE,
    supportedLngs: [...SUPPORTED_LANGUAGES],
    interpolation: { escapeValue: false },
    initImmediate: false,
    react: { useSuspense: false },
  });

  return instance;
}
