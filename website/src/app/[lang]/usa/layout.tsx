import "@/app/fusion.css";
import RegistryChrome from "@/components/RegistryChrome";
import RegistryFooter from "@/components/RegistryFooter";
import { ForcedLocale } from "@/lib/localeContext";

import type { Metadata } from "next";

/**
 * San Francisco pages are written in English; the root layout declares
 * fr_FR, which applied to them until this override.
 * Only the locale is overridden — title, description and image still resolve
 * from the page or the root as before.
 */
export const metadata: Metadata = {
  openGraph: { locale: "en_US", alternateLocale: ["fr_FR"] },
};

/**
 * Layout for every /us route: the shared registry-driven chrome (ADR-0010 D2),
 * inside the fusion theme. French chat/search never render here — ChatPanel and
 * SearchModal suppress themselves on /us paths.
 */
export default function UsLayout({ children }: { children: React.ReactNode }) {
  return (
    <ForcedLocale locale="en">
      <div className="theme-fusion">
        <RegistryChrome country="us" />
        {children}
        <RegistryFooter country="us" />
      </div>
    </ForcedLocale>
  );
}
