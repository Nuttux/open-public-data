"use client";

import { usePathname } from "@/lib/navigation";
import { useT, type Locale } from "@/lib/localeContext";
import { HREFLANG, switchLanguage } from "@/lib/site-locale";
import { localize } from "@/lib/urls";

/**
 * PT/EN toggle for the Recife routes — the same segmented control as the
 * France LangSwitcher, and like it a pair of real <a href> to the page's twin
 * (/pt/brasil/recife/… and /en/brasil/recife/…), so crawlers pass link equity
 * between them. On click the choice is remembered and the query and hash kept.
 */
export default function RecifeLangToggle({ locale }: { locale: Locale }) {
  const t = useT();
  const logical = usePathname();

  const go = (next: "pt" | "en") => (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    if (next === locale) return;
    switchLanguage(next);
  };

  const item = (l: "pt" | "en", label: string) => (
    <a
      key={l}
      href={localize(logical, l)}
      hrefLang={HREFLANG[l]}
      onClick={go(l)}
      className={locale === l ? "fx-lang-on" : "fx-lang-off"}
      aria-current={locale === l ? "page" : undefined}
    >
      {label}
    </a>
  );

  return (
    <div className="fx-lang" aria-label={t("br.recife.lang.aria")}>
      {item("pt", "PT")}
      {item("en", "EN")}
    </div>
  );
}
