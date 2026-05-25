"use client";

import { useTranslation } from "react-i18next";

export const actionButtonClass =
  "btn btn-outline inline-flex h-11 min-h-11 items-center justify-center px-5 text-sm font-medium sm:px-6";

export const actionButtonGridClass = `${actionButtonClass} w-full text-center`;

const NPM_URL = "https://www.npmjs.com/package/rssany";
const DOCS_URL = "https://github.com/joohw/rssany#readme";

type ClientDownloadButtonsProps = {
  className?: string;
};

export function ClientDownloadButtons({ className = "" }: ClientDownloadButtonsProps) {
  const { t } = useTranslation();

  return (
    <div className={`flex flex-wrap gap-3 ${className}`.trim()}>
      <a href={NPM_URL} className={actionButtonClass} target="_blank" rel="noopener noreferrer">
        {t("home.installNpm")}
      </a>
      <a href={DOCS_URL} className={actionButtonClass} target="_blank" rel="noopener noreferrer">
        {t("home.viewDocs")}
      </a>
    </div>
  );
}
