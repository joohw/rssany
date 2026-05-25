"use client";

import { SiteHeader } from "@/components/site-header";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <div className="pt-[var(--app-header-height)]">{children}</div>
    </>
  );
}
