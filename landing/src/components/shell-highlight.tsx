"use client";

import { codeToHtml } from "shiki";
import { useEffect, useState } from "react";
import { useDarkMode } from "@/hooks/use-dark-mode";
import styles from "./shell-highlight.module.css";

type ShellHighlightProps = {
  code: string;
  className?: string;
};

export function ShellHighlight({ code, className }: ShellHighlightProps) {
  const dark = useDarkMode();
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const out = await codeToHtml(code, {
          lang: "bash",
          theme: dark ? "one-dark-pro" : "one-light",
        });
        if (!cancelled) setHtml(out);
      } catch {
        if (!cancelled) setHtml(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, dark]);

  if (html == null) {
    return (
      <code className={`${styles.fallback} ${className ?? ""}`.trim()}>{code}</code>
    );
  }

  return (
    <span
      className={`${styles.wrap} ${className ?? ""}`.trim()}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
