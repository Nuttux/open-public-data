"use client";

import Link from "next/link";
// Direct imports — the barrel pulls in server-only components (ProjetThumb,
// ProjetFiche) that fail to bundle for the client (they read node:fs via
// fusion-data).
import Navbar from "@/components/fusion/Navbar";
import Footer from "@/components/fusion/Footer";
import ScopeDropdown from "@/components/fusion/ScopeDropdown";
import HeroBg from "@/components/fusion/HeroBg";
import HeroDeck from "@/components/fusion/HeroDeck";
import HeroMarquee from "@/components/fusion/HeroMarquee";
import CountUpOnReveal from "@/components/fusion/CountUpOnReveal";
import { fmtInt, fmtBillions } from "@/lib/fmt";
import type { LandingStats } from "@/lib/fusion-data";
import type { BlogPostMeta } from "@/lib/blog";
import { useT, useLocale } from "@/lib/localeContext";

type Props = { stats: LandingStats; posts: BlogPostMeta[] };

export default function LandingClient({ stats, posts }: Props) {
  const t = useT();
  const { locale } = useLocale();

  const fill = (key: string, vars: Record<string, string | number>) => {
    let s = t(key);
    for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
    return s;
  };

  return (
    <div className="theme-fusion">
      <Navbar />
      <main id="main-content" tabIndex={-1}>

      {/* HERO */}
      <section className="fx-hero" id="hero">
        <HeroBg />
        <div className="fx-wrap">
          <h1>
            {t("fx.land.h1.before")}<em>{t("fx.land.h1.em")}</em>
            <br />{t("fx.land.h1.mid")}
            <ScopeDropdown variant="h1" />
            {t("fx.land.h1.after")}
          </h1>
          <p className="fx-lede">
            {fill(stats.budgetType === "vote" ? "fx.land.lede.vote" : "fx.land.lede.execute", {
              budget: fmtBillions(stats.totalDepenses),
              year: stats.year,
              nbMarches: fmtInt(Math.floor(stats.nbMarchesCumul / 1000) * 1000),
              nbSubventions: fmtInt(Math.floor(stats.nbSubventionsCumul / 1000) * 1000),
              marchesSinceYear: stats.marchesSinceYear,
              subventionsSinceYear: stats.subventionsSinceYear,
            })}
          </p>
        </div>
      </section>

      {/* HERO DECK — 4 cards concrètes, cliquables vers fiches */}
      <HeroDeck stats={stats} />

      {/* HERO MARQUEE — bande défilante en aval du deck : montre l'exhaustivité
       *  ("ce n'est pas QUE ces 4 cards, c'est aussi tout ça") */}
      <HeroMarquee />

      {/* ACTE 2 — Échelle : où vont les 462€/mois (sans H2, le chiffre EST le titre) */}
      <section className="fx-echelle" id="echelle">
        <div className="fx-wrap">
          <p className="fx-echelle-big tnum">
            <span className="fx-echelle-num">
              <CountUpOnReveal value={stats.perCapitaMonth} format={(n) => fmtInt(n)} durationMs={1100} threshold={0.4} />
            </span>
            <span className="fx-echelle-u">€</span>
            <span className="fx-echelle-per">{t("fx.land.echelle.per")}</span>
          </p>
          <p className="fx-echelle-delta">
            {fill("fx.land.echelle.total", { amount: fmtBillions(stats.totalDepenses) })}
          </p>
        </div>
      </section>

      {/* ACTE 4 — Mini-cards "Explorer par section" */}
      <section className="fx-chip-strip" id="explorer-aussi" aria-label={t("fx.land.chips.aria")}>
        <div className="fx-wrap">
          <p className="fx-chip-strip-kicker">{t("fx.land.chips.kicker")}</p>
          <h2 className="fx-chip-strip-h2">
            {t("fx.land.chips.h2.before")}<em>{t("fx.land.chips.h2.em")}</em>{t("fx.land.chips.h2.dot")}
          </h2>
          <ul className="fx-chip-strip-list">
            <li>
              <Link href="/ville/paris/budget">
                <span className="fx-chip-strip-title">{t("fx.land.chips.budget")}</span>
                <span className="fx-chip-strip-desc">{t("fx.land.chips.budget_desc")}</span>
                <span className="fx-chip-strip-arrow" aria-hidden="true">→</span>
              </Link>
            </li>
            <li>
              <Link href="/ville/paris/investissements">
                <span className="fx-chip-strip-title">{t("fx.land.chips.invest")}</span>
                <span className="fx-chip-strip-desc">{t("fx.land.chips.invest_desc")}</span>
                <span className="fx-chip-strip-arrow" aria-hidden="true">→</span>
              </Link>
            </li>
            <li>
              <Link href="/ville/paris/subventions">
                <span className="fx-chip-strip-title">{t("fx.land.chips.subv")}</span>
                <span className="fx-chip-strip-desc">{t("fx.land.chips.subv_desc")}</span>
                <span className="fx-chip-strip-arrow" aria-hidden="true">→</span>
              </Link>
            </li>
            <li>
              <Link href="/ville/paris/marches">
                <span className="fx-chip-strip-title">{t("fx.land.chips.marches")}</span>
                <span className="fx-chip-strip-desc">{t("fx.land.chips.marches_desc")}</span>
                <span className="fx-chip-strip-arrow" aria-hidden="true">→</span>
              </Link>
            </li>
            <li>
              <Link href="/ville/paris/dette">
                <span className="fx-chip-strip-title">{t("fx.land.chips.dette")}</span>
                <span className="fx-chip-strip-desc">{t("fx.land.chips.dette_desc")}</span>
                <span className="fx-chip-strip-arrow" aria-hidden="true">→</span>
              </Link>
            </li>
            <li>
              <Link href="/ville/paris/logement">
                <span className="fx-chip-strip-title">{t("fx.land.chips.logement")}</span>
                <span className="fx-chip-strip-desc">{t("fx.land.chips.logement_desc")}</span>
                <span className="fx-chip-strip-arrow" aria-hidden="true">→</span>
              </Link>
            </li>
          </ul>
        </div>
      </section>

      {/* ANALYSES — teaser éditorial */}
      {posts.length > 0 && (
        <section className="fx-analyses" id="analyses">
          <div className="fx-wrap">
            <div className="fx-analyses-head">
              <h2>
                {t("fx.land.analyses.h2.before")}
                <em>{t("fx.land.analyses.h2.em")}</em>
                {t("fx.land.analyses.h2.dot")}
              </h2>
              <p className="fx-sub">{t("fx.land.analyses.sub")}</p>
            </div>

            <div className="fx-analyses-grid">
              {posts.slice(0, 3).map((p) => (
                <Link
                  key={p.slug}
                  href={`/analyses/${p.slug}`}
                  className="fx-analyses-card"
                >
                  {p.image && (
                    <div className="fx-analyses-media">
                      <img src={p.image} alt="" loading="lazy" />
                    </div>
                  )}
                  <div className="fx-analyses-body">
                    {(locale === "en" && p.category_en) || p.category ? (
                      <span className="fx-analyses-cat">
                        {locale === "en" && p.category_en ? p.category_en : p.category}
                      </span>
                    ) : null}
                    <h3 className="fx-analyses-title">{locale === "en" && p.title_en ? p.title_en : p.title}</h3>
                    <p className="fx-analyses-desc">{locale === "en" && p.description_en ? p.description_en : p.description}</p>
                    <div className="fx-analyses-foot">
                      <span>
                        {new Date(p.date).toLocaleDateString(
                          locale === "en" ? "en-GB" : "fr-FR",
                          { day: "numeric", month: "long", year: "numeric" },
                        )}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{p.readingTime}</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>

            <div className="fx-analyses-foot-all">
              <Link href="/analyses">{t("fx.land.analyses.see_all")} →</Link>
            </div>
          </div>
        </section>
      )}

      {/* MÉTHODE */}
      <section className="fx-meth" id="meth">
        <div className="fx-wrap">
          <h2>
            {t("fx.land.meth.h2.before")}<em>{t("fx.land.meth.h2.em")}</em>{t("fx.land.meth.h2.dot")}
          </h2>
          <div className="fx-meth-cols">
            <div className="fx-meth-c">
              <div className="fx-meth-n">{t("fx.land.meth.01.n")}</div>
              <h3>{t("fx.land.meth.01.h")}</h3>
              <p>{t("fx.land.meth.01.p")}</p>
              <Link href="/methode">{t("fx.land.meth.01.cta")}</Link>
            </div>
            <div className="fx-meth-c">
              <div className="fx-meth-n">{t("fx.land.meth.02.n")}</div>
              <h3>{t("fx.land.meth.02.h")}</h3>
              <p>{t("fx.land.meth.02.p")}</p>
              <Link href="/methode">{t("fx.land.meth.02.cta")}</Link>
            </div>
            <div className="fx-meth-c">
              <div className="fx-meth-n">{t("fx.land.meth.03.n")}</div>
              <h3>{t("fx.land.meth.03.h")}</h3>
              <p>{t("fx.land.meth.03.p")}</p>
              <a href="https://github.com/AbstractsMachine/france-open-data-pipeline" target="_blank" rel="noopener noreferrer">
                {t("fx.land.meth.03.cta")}
              </a>
            </div>
          </div>

        </div>
      </section>

      </main>
      <Footer />
    </div>
  );
}
