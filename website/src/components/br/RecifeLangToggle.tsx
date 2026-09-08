"use client";

import { usePathname } from "next/navigation";
import { useT, type Locale } from "@/lib/localeContext";
import { LOCALE_HOSTS, urlForLocale } from "@/lib/site-locale";

/**
 * PT/EN toggle for /br routes — the same segmented control as the France
 * LangSwitcher, and like it a pair of real <a href> to the twin host
 * (pt.qipu.org speaks Portuguese, www English), so crawlers pass link
 * equity between the twins. On click the navigation uses the host actually
 * serving, so it also works on localhost and previews.
 */
export default function RecifeLangToggle({ locale }: { locale: Locale }) {
  const t = useT();
  const pathname = usePathname() ?? "/br/city/recife";

  const go = (next: "pt" | "en") => (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (next === locale) {
      e.preventDefault();
      return;
    }
    if (typeof window !== "undefined") {
      e.preventDefault();
      const { search, hash, host } = window.location;
      window.location.assign(urlForLocale(next, `${pathname}${search}${hash}`, host));
    }
  };

  const item = (l: "pt" | "en", label: string) => (
    <a
      key={l}
      href={`${LOCALE_HOSTS[l]}${pathname}`}
      hrefLang={l === "pt" ? "pt-BR" : "en"}
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
