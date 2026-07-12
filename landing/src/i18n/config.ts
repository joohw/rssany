import en from "@/i18n/resources/en";
import zhCN from "@/i18n/resources/zh-CN";

export const DEFAULT_LANGUAGE = "zh-CN";
export const SUPPORTED_LANGUAGES = ["zh-CN", "en"] as const;
export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export function isAppLanguage(value: string): value is AppLanguage {
  return SUPPORTED_LANGUAGES.includes(value as AppLanguage);
}

export function localizedPath(language: AppLanguage, pathname = "/"): string {
  const normalized = pathname === "/" ? "" : `/${pathname.replace(/^\/+|\/+$/g, "")}`;
  return `/${language}${normalized}`;
}

export function switchLocalizedPath(pathname: string, language: AppLanguage): string {
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] && isAppLanguage(segments[0])) segments.shift();
  return localizedPath(language, `/${segments.join("/")}`);
}

export const resources = {
  "zh-CN": { translation: zhCN },
  en: { translation: en },
} as const;
