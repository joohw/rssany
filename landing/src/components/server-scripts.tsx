"use client";

import { useServerInsertedHTML } from "next/navigation";
import { THEME_BOOT_SCRIPT } from "@/lib/theme";

type ServerScriptsProps = {
  jsonLd: string;
};

export function ServerScripts({ jsonLd }: ServerScriptsProps) {
  useServerInsertedHTML(() => (
    <script
      dangerouslySetInnerHTML={{
        __html: THEME_BOOT_SCRIPT,
      }}
    />
  ));

  useServerInsertedHTML(() => (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: jsonLd }}
    />
  ));

  return null;
}
