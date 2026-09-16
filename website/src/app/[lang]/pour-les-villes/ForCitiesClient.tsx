import { readSiteLocale } from "@/lib/seo";

import Navbar from "@/components/fusion/Navbar";
import Footer from "@/components/fusion/Footer";
import Button from "@/components/fusion/Button";
import SectionHead from "@/components/fusion/SectionHead";
import FindCommuneButton from "@/components/fusion/FindCommuneButton";
import Link from "@/components/LocalizedLink";
import LocaleRefresh from "@/components/LocaleRefresh";
import { ViewPing, DwellPing } from "@/components/AnalyticsPing";
import type { Locale } from "@/lib/localeContext";
import fr from "@/i18n/fr";
import en from "@/i18n/en";
import pt from "@/i18n/pt";

const DICTS = { fr, en, pt } as const;

/**
 * Locale for this page: the host's (lib/site-locale.ts). This is one of the
 * few paths that exists in all three languages, so a Recife visitor on
 * pt.qipu.org reads it in Portuguese. A legacy `?lang=` still wins for the
 * one render before proxy.ts redirects it to the right host.
 */
export async function resolveCitiesLocale(lang?: string): Promise<Locale> {
  if (lang === "fr" || lang === "en" || lang === "pt") return lang;
  return readSiteLocale();
}

/**
 * What a commune's page becomes with the commune's own data — each line is a
 * real Paris page, opened from the line. Examples, never a feature list.
 */
const WITH_DATA = [
  { key: "b1", href: "/france/paris/subventions" },
  { key: "b2", href: "/france/paris/investissements" },
  { key: "b3", href: "/france/paris/budget" },
  { key: "b4", href: "/france/paris/lieux" },
  { key: "b5", href: "/chat" },
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
            <h1 className="fx-page-title">{t("fx.cities.h1")}</h1>
            <p className="fx-page-lede">{t("fx.cities.lede")}</p>
            <FindCommuneButton label={t("fx.cities.find")} cta="for_cities_find" />
          </div>
        </section>

        {/* 01 — what every commune's page already shows. */}
        <section className="fx-section">
          <div className="fx-wrap">
            <SectionHead number="01" kind={t("fx.cities.s01.kind")} title={t("fx.cities.s01.title")} />
            <p className="fx-cities-p">{t("fx.cities.s01.p1")}</p>
            <p className="fx-cities-p">{t("fx.cities.s01.p2")}</p>
          </div>
        </section>

        {/* 02 — what it becomes with the commune's data: Paris, page by page. */}
        <section className="fx-section">
          <div className="fx-wrap">
            <SectionHead number="02" kind={t("fx.cities.s02.kind")} title={t("fx.cities.s02.title")} />
            <p className="fx-cities-p">
              {t("fx.cities.s02.p1")}{" "}
              <Link href="/france/paris" data-cta="for_cities_paris">{t("fx.cities.s02.paris")}</Link>
              {t("fx.cities.s02.p1_after")}
            </p>
            <ul className="fx-cities-bullets">
              {WITH_DATA.map((b) => (
                <li key={b.key}>
                  <Link href={b.href} data-cta={`for_cities_${b.key}`}>{t(`fx.cities.s02.${b.key}`)}</Link>
                </li>
              ))}
            </ul>
            <p className="fx-cities-p">{t("fx.cities.s02.p2")}</p>
          </div>
        </section>

        {/* 03 — the ask, and why we ask. */}
        <section className="fx-section" id="ecrire">
          <div className="fx-wrap">
            <SectionHead number="03" kind={t("fx.cities.s03.kind")} title={t("fx.cities.s03.title")} />
            <p className="fx-cities-p">{t("fx.cities.s03.p1")}</p>
            <ul className="fx-cities-bullets">
              {[1, 2, 3].map((i) => (
                <li key={i}>{t(`fx.cities.s03.q${i}`)}</li>
              ))}
            </ul>
            <p className="fx-cities-p">{t("fx.cities.s03.p2")}</p>
            <div style={{ marginTop: 24 }}>
              <Button
                variant="primary"
                data-cta="city_enquiry"
                href={`mailto:daniel@qipu.org?subject=${encodeURIComponent(locale === "en" ? "Town" : "Commune")}`}
              >
                {t("fx.cities.s03.btn")}
              </Button>
            </div>
          </div>
        </section>

      </main>
      <Footer />
    </div>
  );
}
