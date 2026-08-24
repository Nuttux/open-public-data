import { cookies } from "next/headers";

import Navbar from "@/components/fusion/Navbar";
import Footer from "@/components/fusion/Footer";
import Button from "@/components/fusion/Button";
import SectionHead from "@/components/fusion/SectionHead";
import LocaleRefresh from "@/components/LocaleRefresh";
import { ViewPing, DwellPing } from "@/components/AnalyticsPing";
import type { Locale } from "@/lib/localeContext";
import fr from "@/i18n/fr";
import en from "@/i18n/en";
import pt from "@/i18n/pt";

const DICTS = { fr, en, pt } as const;

/**
 * Locale for this page, most explicit signal first:
 *   1. ?lang= — how the Recife and SF surfaces link here, so a visitor is never
 *      handed a French page from an English or Portuguese one.
 *   2. dl_locale — the site-wide FR/EN toggle.
 *   3. br_locale=pt — only set when someone actively chose Portuguese on the
 *      Recife tree, so it is a real preference rather than a default.
 */
export async function resolveCitiesLocale(lang?: string): Promise<Locale> {
  if (lang === "fr" || lang === "en" || lang === "pt") return lang;
  try {
    const store = await cookies();
    const dl = store.get("dl_locale")?.value;
    if (dl === "en") return "en";
    if (dl === "fr") return "fr";
    if (store.get("br_locale")?.value === "pt") return "pt";
  } catch {
    /* cookies() may throw during static evaluation — fall through to default */
  }
  return process.env.DEFAULT_LOCALE === "en" ? "en" : "fr";
}

/** The cities already online, in registry order. Proper nouns, so not translated. */
const LIVE = [
  { name: "Paris", href: "/" },
  { name: "San Francisco", href: "/us/city/sf" },
  { name: "Recife", href: "/br/city/recife" },
] as const;

/**
 * Three real pages on three live cities. Examples, not a feature list: what a
 * city can have depends on what it publishes, and naming the French sources
 * (DGFiP, DECP) would mean nothing to a reader in San Francisco or Recife.
 * Showing three live pages says more than any list of modules could.
 */
const EXAMPLES = [
  { key: "ex1", city: "Paris", href: "/fr/city/paris/budget" },
  { key: "ex2", city: "San Francisco", href: "/us/city/sf/payroll" },
  { key: "ex3", city: "Recife", href: "/br/city/recife/contratos" },
] as const;

export default async function ForCitiesClient({ lang }: { lang?: string }) {
  const locale = await resolveCitiesLocale(lang);
  const dict = DICTS[locale];
  // Same fallback chain as the context t(): active dict, FR, then the raw key.
  const t = (key: string): string => dict[key] ?? fr[key] ?? key;

  return (
    <div className="theme-fusion">
      <LocaleRefresh />
      {/* The only page on the site with a commercial job: measure that it was
          opened, that it was read, and that someone wrote. */}
      <ViewPing event="for_cities_view" props={{ lang: locale }} />
      <DwellPing event="for_cities_read" seconds={30} props={{ lang: locale }} />
      <Navbar />
      <main id="main-content" tabIndex={-1}>

        <section className="fx-page-header">
          <div className="fx-wrap">
            <div className="fx-page-kicker">{t("fx.cities.kicker")}</div>
            <h1 className="fx-page-title">
              {t("fx.cities.title.before")}
              <em>{t("fx.cities.title.em")}</em>
              {t("fx.cities.title.after")}
            </h1>
            <p className="fx-page-lede">{t("fx.cities.lede")}</p>

            <div className="fx-cities-live">
              <span className="fx-cities-live-label">{t("fx.cities.live.label")}</span>
              {LIVE.map((city, i) => (
                <span key={city.name}>
                  {i > 0 && <span className="fx-cities-live-sep" aria-hidden="true">· </span>}
                  <a href={city.href}>{city.name}</a>
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* 01 — three live pages, as proof rather than promise. */}
        <section className="fx-section">
          <div className="fx-wrap">
            <SectionHead
              number="01"
              kind={t("fx.cities.s01.kind")}
              title={
                <>
                  {t("fx.cities.s01.title.before")}
                  <em>{t("fx.cities.s01.title.em")}</em>
                </>
              }
            />
            <div className="fx-sources">
              {EXAMPLES.map((ex) => (
                <div key={ex.key}>
                  <div className="n">{ex.city}</div>
                  <h3>{t(`fx.cities.${ex.key}.h`)}</h3>
                  <a href={ex.href}>{t("fx.cities.ex.see")} ↗</a>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 02 — the ask. */}
        <section className="fx-section" id="ecrire">
          <div className="fx-wrap">
            <SectionHead
              number="02"
              kind={t("fx.cities.s02.kind")}
              title={
                <>
                  {t("fx.cities.s02.title.before")}
                  <em>{t("fx.cities.s02.title.em")}</em>
                </>
              }
            />
            <ul className="fx-cities-bullets">
              {[1, 2, 3].map((i) => (
                <li key={i}>{t(`fx.cities.s02.b${i}`)}</li>
              ))}
            </ul>
            <div style={{ marginTop: 24, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Button
                variant="primary"
                data-cta="city_enquiry"
                href={`mailto:daniel@qipu.org?subject=${encodeURIComponent(
                  locale === "pt" ? "Cidade" : locale === "en" ? "City" : "Ville",
                )}`}
              >
                {t("fx.cities.s02.btn")}
              </Button>
              <Button href="/methode" data-cta="for_cities_method">{t("fx.cities.s02.btn2")}</Button>
            </div>
          </div>
        </section>

      </main>
      <Footer />
    </div>
  );
}
