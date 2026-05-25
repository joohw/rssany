import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { AppShell } from "@/components/app-shell";
import { I18nProvider } from "@/components/i18n-provider";
import { ServerScripts } from "@/components/server-scripts";
import { ToastProvider } from "@/components/ui/toast-provider";
import { resolveLanguage } from "@/i18n/resolve-language";
import { LANG_STORAGE_KEY } from "@/i18n/config";
import { buildBaseJsonLdGraph, buildPageMetadata } from "@/lib/seo";
import { getPublicSiteUrlFromRequest } from "@/lib/site";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadata("home");
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const headerStore = await headers();
  const cookieStore = await cookies();
  const host =
    headerStore.get("x-forwarded-host") || headerStore.get("host") || undefined;
  const language = resolveLanguage({
    cookie: cookieStore.get(LANG_STORAGE_KEY)?.value,
    acceptLanguage: headerStore.get("accept-language"),
  });
  const siteUrl = getPublicSiteUrlFromRequest(host);
  const jsonLd = buildBaseJsonLdGraph({ siteUrl, language });
  const jsonLdScript = JSON.stringify(jsonLd).replace(/</g, "\\u003c");

  return (
    <html lang={language} suppressHydrationWarning className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <ServerScripts jsonLd={jsonLdScript} />
        <I18nProvider language={language}>
          <ToastProvider>
            <AppShell>{children}</AppShell>
          </ToastProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
