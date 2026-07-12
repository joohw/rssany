import { THEME_BOOT_SCRIPT } from "@/lib/theme";

type ServerScriptsProps = {
  jsonLd: string;
};

export function ServerScripts({ jsonLd }: ServerScriptsProps) {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
    </>
  );
}
