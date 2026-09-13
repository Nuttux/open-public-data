"use client";

import { usePathname } from "@/lib/navigation";
import { useLocale, useT } from "@/lib/localeContext";
import { useTrack } from "@/lib/analyticsContext";
import { HREFLANG, switchLanguage, type SiteLocale } from "@/lib/site-locale";
import { langOf, localize } from "@/lib/urls";

/**
 * FR/EN switch. Each option is a real <a href> to the same page in the other
 * language (lib/urls.ts): a crawler following it passes link equity between
 * the twins, which hreflang alone does not do. The twins are derived from the
 * logical path, so the server render and the client agree. On click the
 * choice is remembered (the `/` redirect reads it) and the query and hash are
 * kept.
 */
export default function LangSwitcher() {
  const { locale } = useLocale();
  const logical = usePathname();
  const t = useT();
  const track = useTrack();

  /** The page's address in `l`, or null when the page does not exist in it. */
  const twin = (l: SiteLocale): string | null => {
    const address = localize(logical, l);
    return langOf(address) === l ? address : null;
  };

  const go = (next: SiteLocale) => (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    if (next === locale) return;
    track("lang_switch", { from: locale, to: next });
    switchLanguage(next);
  };

  const item = (l: SiteLocale, label: string) => {
    const href = twin(l);
    return href ? (
      <a
        key={l}
        href={href}
        hrefLang={HREFLANG[l]}
        onClick={go(l)}
        className={locale === l ? "fx-lang-on" : "fx-lang-off"}
        aria-current={locale === l ? "page" : undefined}
      >
        {label}
      </a>
    ) : null;
  };

  return (
    <div className="fx-lang" aria-label={t("fx.nav.lang_aria")}>
      {item("fr", "FR")}
      {item("en", "EN")}
    </div>
  );
}
