import type { AppLanguage } from "@/i18n/config";

/** Bump version when replacing use-case screenshots under the same filename. */
const USE_CASE_VERSION = "rssany-1";

export type UseCaseImage = {
  src: string;
  width: number;
  height: number;
};

const USE_CASE_IMAGES: Record<AppLanguage, UseCaseImage> = {
  "zh-CN": {
    src: `/use-case-zh.png?v=${USE_CASE_VERSION}`,
    width: 730,
    height: 731,
  },
  en: {
    src: `/use-case-en.png?v=${USE_CASE_VERSION}`,
    width: 730,
    height: 731,
  },
};

export function getUseCaseImage(language: string): UseCaseImage {
  return language.startsWith("zh") ? USE_CASE_IMAGES["zh-CN"] : USE_CASE_IMAGES.en;
}
