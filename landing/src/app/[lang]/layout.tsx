import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { I18nProvider } from "@/components/i18n-provider";
import { ServerScripts } from "@/components/server-scripts";
import { ToastProvider } from "@/components/ui/toast-provider";
import { isAppLanguage, SUPPORTED_LANGUAGES } from "@/i18n/config";
import { buildSiteJsonLdGraph } from "@/lib/seo";
import { PUBLIC_SITE_URL } from "@/lib/site";
import "../globals.css";

export const dynamicParams = false;

export function generateStaticParams() {
  return SUPPORTED_LANGUAGES.map((lang) => ({ lang }));
}

export default async function LanguageLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}>) {
  const { lang } = await params;
  if (!isAppLanguage(lang)) notFound();

  const jsonLd = buildSiteJsonLdGraph({ siteUrl: PUBLIC_SITE_URL, language: lang });
  const jsonLdScript = JSON.stringify(jsonLd).replace(/</g, "\\u003c");

  return (
    <html lang={lang} suppressHydrationWarning className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <ServerScripts jsonLd={jsonLdScript} />
        <I18nProvider language={lang}>
          <ToastProvider>
            <AppShell>{children}</AppShell>
          </ToastProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
