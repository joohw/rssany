import en from "@/i18n/resources/en";
import zhCN from "@/i18n/resources/zh-CN";

export const DEFAULT_LANGUAGE = "zh-CN";
export const SUPPORTED_LANGUAGES = ["zh-CN", "en"] as const;
export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number];
export const LANG_STORAGE_KEY = "clovapi-lang";

export const resources = {
  "zh-CN": { translation: zhCN },
  en: { translation: en },
} as const;
