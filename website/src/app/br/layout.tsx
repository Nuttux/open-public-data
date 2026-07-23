import "@/app/fusion.css";
import { cookies } from "next/headers";
import { ForcedLocale, type Locale } from "@/lib/localeContext";
import RegistryChrome from "@/components/RegistryChrome";
import RegistryFooter from "@/components/RegistryFooter";
import RecifeLangToggle from "@/components/br/RecifeLangToggle";

/**
 * Layout for every /br route — Recife (br-municipal). Locale is pt by default
 * with an en toggle (br_locale cookie), server-rendered flash-free via
 * ForcedLocale. Chrome is the shared registry-driven RegistryChrome; the only
 * Recife-specific piece is the PT/EN toggle in its `trailing` slot.
 */
export default async function BrLayout({ children }: { children: React.ReactNode }) {
  const store = await cookies();
  const locale: Locale = store.get("br_locale")?.value === "en" ? "en" : "pt";
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
