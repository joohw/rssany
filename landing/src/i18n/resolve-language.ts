import { DEFAULT_LANGUAGE, LANG_STORAGE_KEY, type AppLanguage } from "@/i18n/config";

export function normalizeLanguage(value: string | null | undefined): AppLanguage | null {
  if (!value) return null;
  const lower = value.trim().toLowerCase();
  if (lower.startsWith("zh")) return "zh-CN";
  if (lower.startsWith("en")) return "en";
  return null;
}

export function resolveLanguageFromAcceptLanguage(header: string | null | undefined): AppLanguage {
  if (!header) return DEFAULT_LANGUAGE;

  for (const part of header.split(",")) {
    const language = normalizeLanguage(part.trim().split(";")[0]);
    if (language) return language;
  }

  return DEFAULT_LANGUAGE;
}

export function resolveLanguage(options: {
  cookie?: string | null;
  acceptLanguage?: string | null;
}): AppLanguage {
  return (
    normalizeLanguage(options.cookie) ??
    resolveLanguageFromAcceptLanguage(options.acceptLanguage) ??
    DEFAULT_LANGUAGE
  );
}

export function buildLanguageCookie(language: AppLanguage) {
  return `${LANG_STORAGE_KEY}=${encodeURIComponent(language)}; Path=/; Max-Age=31536000; SameSite=Lax`;
}
