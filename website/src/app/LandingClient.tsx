"use client";

import Link from "next/link";
// Direct imports — the barrel pulls in server-only components (ProjetThumb,
// ProjetFiche) that fail to bundle for the client (they read node:fs via
// fusion-data).
import Navbar from "@/components/fusion/Navbar";
import Footer from "@/components/fusion/Footer";
import Button from "@/components/fusion/Button";
import ScopeDropdown from "@/components/fusion/ScopeDropdown";
import BrandMark from "@/components/fusion/BrandMark";
import HeroBg from "@/components/fusion/HeroBg";
import HeroDeck from "@/components/fusion/HeroDeck";
import BarRow from "@/components/fusion/BarRow";
import { fmtInt, fmtBillions } from "@/lib/fmt";
import type { LandingStats } from "@/lib/fusion-data";
import type { BlogPostMeta } from "@/lib/blog";
import { useT, useLocale } from "@/lib/localeContext";
import { trLabel } from "@/lib/label-translate";

type Props = { stats: LandingStats; posts: BlogPostMeta[] };

export default function LandingClient({ stats, posts }: Props) {
  const t = useT();
  const { locale } = useLocale();
  const deltaPct = stats.deltaVsLastExecutedPct;
  const arrow = deltaPct < -0.1 ? "↓" : Math.abs(deltaPct) < 0.1 ? "→" : "↑";

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
          <div className="fx-ctas">
            <Button variant="primary" href="/ville/paris/budget">
              {fill("fx.land.cta.explore", { year: stats.year })}
            </Button>
          </div>
        </div>
      </section>

      {/* HERO DECK — remplace SCALE : 4 cards concrètes, cliquables vers fiches */}
      <HeroDeck stats={stats} />

      {/* ACTE 2 — Échelle : où vont les 462€/mois */}
      <section className="fx-echelle" id="echelle">
        <div className="fx-wrap">
          <h2 className="fx-echelle-h2">
            {t("fx.land.echelle.h2.before")}
            <em>{t("fx.land.echelle.h2.em")}</em>
            {t("fx.land.echelle.h2.dot")}
          </h2>
          <p className="fx-echelle-big tnum">
            <span className="fx-echelle-num">{fmtInt(stats.perCapitaMonth)}</span>
            <span className="fx-echelle-u">€</span>
            <span className="fx-echelle-per">{t("fx.land.echelle.per")}</span>
          </p>
          <p className="fx-echelle-delta">
            <span aria-hidden="true">{arrow}</span>{" "}
            <b>{Math.abs(deltaPct).toFixed(1).replace(".", ",")} %</b>{" "}
            {fill("fx.land.echelle.vs", { year: stats.lastExecutedYear })}
            <span className="fx-echelle-sep">·</span>
            {fill("fx.land.echelle.total", { amount: fmtBillions(stats.totalDepenses) })}
          </p>
          <p className="fx-echelle-sub">{t("fx.land.echelle.sub")}</p>
          <BarRow
            reveal
            items={stats.breakdown.map((b) => ({
              label: b.label === "Autres (D)" ? t("fx.land.echelle.autres") : trLabel(b.label, locale),
              value: b.perMonth,
              unit: "€",
              display: fmtInt(b.perMonth),
              href: `/ville/paris/budget?year=${stats.year}#sec-flux`,
            }))}
          />
        </div>
      </section>

      {/* MÉTHODE STRIP — prominence en haut de page */}
      <section className="fx-meth-strip" id="meth-strip">
        <div className="fx-wrap">
          <Link href="/methode" className="fx-meth-strip-link">
            <span className="fx-meth-strip-label">
              {t("fx.land.meth_strip.label")}
            </span>
            <span className="fx-meth-strip-tags">
              <span>{t("fx.land.meth_strip.tag1")}</span>
              <span>·</span>
              <span>{t("fx.land.meth_strip.tag2")}</span>
              <span>·</span>
              <span>{t("fx.land.meth_strip.tag3")}</span>
            </span>
            <span className="fx-meth-strip-cta">
              {t("fx.land.meth_strip.cta")} <span aria-hidden="true">→</span>
            </span>
          </Link>
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

      {/* ACTE 4 — Chip strip : Explorer toutes les sections (discoverabilité mobile) */}
      <section className="fx-chip-strip" id="explorer-aussi" aria-label={t("fx.land.chips.aria")}>
        <div className="fx-wrap">
          <h3 className="fx-chip-strip-h">{t("fx.land.chips.h")}</h3>
          <ul className="fx-chip-strip-list">
            <li><Link href="/ville/paris/budget">{t("fx.land.chips.budget")}</Link></li>
            <li><Link href="/ville/paris/investissements">{t("fx.land.chips.invest")}</Link></li>
            <li><Link href="/ville/paris/subventions">{t("fx.land.chips.subv")}</Link></li>
            <li><Link href="/ville/paris/marches">{t("fx.land.chips.marches")}</Link></li>
            <li><Link href="/ville/paris/dette">{t("fx.land.chips.dette")}</Link></li>
            <li><Link href="/ville/paris/logement">{t("fx.land.chips.logement")}</Link></li>
            <li><Link href="/ville/paris/dette/stress-test">{t("fx.land.chips.stress")}</Link></li>
            <li><Link href="/comparer">{t("fx.land.chips.comparer")}</Link></li>
          </ul>
        </div>
      </section>

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
              <a href="https://github.com/Nuttux/open-public-data" target="_blank" rel="noopener noreferrer">
                {t("fx.land.meth.03.cta")}
              </a>
            </div>
          </div>

          <div className="fx-byline">
            <div className="fx-byline-left">
              <span className="fx-byline-mark">
                <BrandMark size={54} />
              </span>
              <div className="fx-byline-text">
                <div className="fx-byline-name">
                  <b>{t("fx.land.byline.name")}</b>{t("fx.land.byline.name_suffix")}
                </div>
                <div className="fx-byline-meta">{t("fx.land.byline.meta")}</div>
              </div>
            </div>
            <div className="fx-byline-actions">
              <a className="fx-btn fx-btn-small" href="/analyses">
                {t("fx.land.byline.docs")}
              </a>
              <a className="fx-btn fx-btn-small" href="/methode">
                {t("fx.land.byline.methode")}
              </a>
              <a
                className="fx-btn fx-btn-small"
                href="https://github.com/Nuttux/open-public-data"
                target="_blank"
                rel="noopener noreferrer"
              >
                {t("fx.land.byline.github")}
              </a>
              <a className="fx-btn fx-btn-small" href="mailto:daniel@franceopendata.org">
                {t("fx.land.byline.contact")}
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
