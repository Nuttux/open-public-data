import { readSiteLocale } from "@/lib/seo";
import "@/app/fusion.css";
import { ForcedLocale, type Locale } from "@/lib/localeContext";
import RegistryChrome from "@/components/RegistryChrome";
import RegistryFooter from "@/components/RegistryFooter";
import RecifeLangToggle from "@/components/br/RecifeLangToggle";

import type { Metadata } from "next";

/**
 * Recife pages are written in Portuguese; the root layout declares fr_FR,
 * which applied to them until this override.
 * Only the locale is overridden — title, description and image still resolve
 * from the page or the root as before.
 */
export const metadata: Metadata = {
  openGraph: { locale: "pt_BR", alternateLocale: ["en_US"] },
};

/**
 * Layout for every /br route — Recife (br-municipal). Locale is pt by default
 * with an en toggle (pt.qipu.org vs www, see lib/site-locale.ts), flash-free via
 * ForcedLocale. Chrome is the shared registry-driven RegistryChrome; the only
 * Recife-specific piece is the PT/EN toggle in its `trailing` slot.
 */
export default async function BrLayout({ children }: { children: React.ReactNode }) {
  const locale: Locale = (await readSiteLocale()) === "en" ? "en" : "pt";
  return (
    <ForcedLocale locale={locale}>
      <div className="theme-fusion">
        <RegistryChrome country="br" trailing={<RecifeLangToggle locale={locale} />} />
        {children}
        <RegistryFooter country="br" />
      </div>
    </ForcedLocale>
  );
}
