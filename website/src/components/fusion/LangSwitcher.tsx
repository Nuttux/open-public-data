"use client";

import { usePathname } from "next/navigation";
import { useLocale, useT } from "@/lib/localeContext";
import { useTrack } from "@/lib/analyticsContext";
import { LOCALE_HOSTS, localesForPath, urlForLocale, type SiteLocale } from "@/lib/site-locale";

/**
 * FR/EN switch. Each option is a real <a href> to the same path on the host
 * that speaks that language (lib/site-locale.ts): a crawler following it
 * passes link equity between the twins, which hreflang alone does not do.
 * The href is the production twin (deterministic on server and client, so
 * hydration never mismatches); on click, the navigation is rewritten to the
 * host actually serving (localhost, preview) so the switch works everywhere.
 */
export default function LangSwitcher() {
  const { locale } = useLocale();
  const pathname = usePathname() ?? "/";
  const t = useT();
  const track = useTrack();
  const twins = localesForPath(pathname);

  const go = (next: SiteLocale) => (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (next === locale) {
      e.preventDefault();
      return;
    }
    track("lang_switch", { from: locale, to: next });
    if (typeof window !== "undefined") {
      e.preventDefault();
      const { search, hash, host } = window.location;
      window.location.assign(urlForLocale(next, `${pathname}${search}${hash}`, host));
    }
  };

  const item = (l: SiteLocale, label: string) =>
    twins.includes(l) ? (
      <a
        key={l}
        href={`${LOCALE_HOSTS[l]}${pathname}`}
        hrefLang={l === "fr" ? "fr-FR" : l === "pt" ? "pt-BR" : "en"}
        onClick={go(l)}
        className={locale === l ? "fx-lang-on" : "fx-lang-off"}
        aria-current={locale === l ? "page" : undefined}
      >
        {label}
      </a>
    ) : null;

  return (
    <div className="fx-lang" aria-label={t("fx.nav.lang_aria")}>
      {item("fr", "FR")}
      {item("en", "EN")}
    </div>
  );
}
