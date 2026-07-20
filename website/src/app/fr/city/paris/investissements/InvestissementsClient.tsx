"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Navbar from "@/components/fusion/Navbar";
import Footer from "@/components/fusion/Footer";
import SectionHead from "@/components/fusion/SectionHead";
import ChartSource from "@/components/fusion/ChartSource";
import AnimatedNumber from "@/components/fusion/AnimatedNumber";
import YearPicker from "@/components/fusion/YearPicker";
import ExportRow from "@/components/fusion/ExportRow";
import Tip from "@/components/fusion/Tip";
import ProjectMap from "@/components/fusion/ProjectMap";
import ProjetThumb from "@/components/fusion/ProjetThumb";
import ParisChoropleth from "@/components/fusion/ParisChoropleth";
import BudgetTimeline from "@/components/fusion/BudgetTimeline";
import StackedBarTheme from "@/components/fusion/StackedBarTheme";
import PageTOC from "@/components/fusion/PageTOC";
import RelatedArticles, { type ArticlePlaceholder } from "@/components/fusion/RelatedArticles";
import PageHook from "@/components/fusion/PageHook";
import PageIntro, { IntroStat } from "@/components/fusion/PageIntro";
import { fill, fmtBillions, fmtDec, fmtInt, fmtMillions } from "@/lib/fmt";
import type { BlogPostMeta } from "@/lib/blog";
import type { InvestissementsData } from "@/lib/fusion-data";
import { slugifyChapitre } from "@/lib/projet-utils";
import { useT, useLocale } from "@/lib/localeContext";
import { trLabel } from "@/lib/label-translate";
import { cityPopulation, citySlugFromPathname } from "@/lib/methodology";


const INV_PLACEHOLDERS: ArticlePlaceholder[] = [
  {
    category: "Analyse",
    title: "Le 13ᵉ et le 17ᵉ : deux géographies d'investissement.",
    description:
      "ZAC Paris Rive Gauche vs Clichy-Batignolles. Deux stratégies de foncier public, deux trajectoires de livraison.",
  },
  {
    category: "Explication",
    title: "AP, CP, CA : comprendre ce que comptabilise un investissement.",
    description:
      "Autorisations de programme, crédits de paiement, comptes administratifs — la chaîne budgétaire d'un chantier, expliquée sans jargon.",
  },
];

export default function InvestissementsClient({
  d,
  posts,
}: {
  d: InvestissementsData;
  posts: BlogPostMeta[];
}) {
  const t = useT();
  const { locale } = useLocale();
  const trL = (s: string | undefined) => trLabel(s, locale);
  // Multi-cities awareness — derive city slug from URL so the same client
  // can render under /fr/city/paris/... and /fr/city/marseille/... without
  // hardcoded paths or constants. cf. project_marseille_v1_decisions.
  const pathname = usePathname();
  const citySlug = citySlugFromPathname(pathname);
  const cityBasePath = `/fr/city/${citySlug}/investissements`;
  const isParis = citySlug === "paris";
  const ytrend = d.yearsSummary;

  const arrSuf = (n: number) => (n === 1 ? t("fx.s.arr.1_suffix") : t("fx.s.arr.suffix"));
  // Paris has both a geolocated map (ProjectMap) and a SVG choropleth wired
  // to its 1-20 arrondissements. Non-Paris cities fall back to a simple
  // ranking list (P3.2 option a stricte: the map+choropleth section
  // disappears when the underlying data isn't there). The toggle is hidden
  // for non-Paris.
  const supportsTerritoryViews = isParis && d.geoPoints.length > 0;
  const [territoryView, setTerritoryView] = useState<"carte" | "liste">(supportsTerritoryViews ? "carte" : "liste");

  return (
    <div className="theme-fusion">
      <Navbar />
      <main id="main-content" tabIndex={-1}>

      <PageTOC
        items={[
          { id: "sec-territoire", label: t("fx.inv.s05.kind") },
          { id: "sec-chapitre", label: t("fx.toc.chapitres") },
          { id: "sec-evolution", label: t("fx.toc.evolution") },
          { id: "sec-projets", label: t("fx.toc.projets") },
          { id: "sec-analyses", label: t("fx.toc.analyses") },
          { id: "sec-sources", label: t("fx.toc.sources") },
        ]}
      />

      <PageIntro
        title={
          <>
            {t("fx.inv.title.before")}
            <em>{t("fx.inv.title.em")}</em>
            {t("fx.inv.title.after")}
          </>
        }
        lede={
          <>
            {fmtInt(d.nbProjets)}{t("fx.inv.lede.a.pre")}
            <Tip label={t("fx.inv.lede.a.operations.tip")}>{t("fx.inv.lede.a.operations")}</Tip>
            {t("fx.inv.lede.a.post")}{d.year}{t("fx.inv.lede.b")}
            <b>
              {fill(t("fx.inv.lede.pct.val"), { pct: fmtDec(d.pctGeo, 0) })}{" "}
              <Tip label={t("fx.inv.lede.pct.term.tip")}>{t("fx.inv.lede.pct.term")}</Tip>
            </b>
            {t("fx.inv.lede.c.pre")}
            <Tip label={t("fx.inv.lede.c.ca.tip")}>{t("fx.inv.lede.c.ca")}</Tip>
            {t("fx.inv.lede.c.post")}
          </>
        }
        actions={
          <YearPicker
            years={d.availableYears}
            current={d.year}
            basePath={cityBasePath}
            label={t("fx.s.year_label")}
          />
        }
        stats={
          <>
            <IntroStat
              value={<AnimatedNumber value={d.total} format={(n) => fmtBillions(n)} />}
              unit={t("fx.s.md_eur")}
              label={<Tip label={t("fx.inv.s02.hero_cap.a.term.tip")}>{fill(t("fx.inv.s02.hero_label"), { year: d.year })}</Tip>}
            />
            <IntroStat
              value={<AnimatedNumber value={d.nbProjets} format={(n) => fmtInt(n)} />}
              label={<Tip label={t("fx.inv.s02.kpi.projets.tip")}>{t("fx.inv.s02.kpi.projets")}</Tip>}
            />
            <IntroStat
              value={<AnimatedNumber value={d.pctGeo} format={(n) => `${fmtDec(n, 0)} %`} />}
              label={<Tip label={t("fx.inv.s02.kpi.geo.tip")}>{t("fx.inv.s02.kpi.geo")}</Tip>}
            />
            {d.byChapitre[0] && (
              <IntroStat
                value={<AnimatedNumber value={d.byChapitre[0].amount} format={(n) => fmtMillions(n, 0)} />}
                unit={t("fx.s.m_eur")}
                label={<>{t("fx.inv.s02.kpi.top_chap")} · {trL(d.byChapitre[0].label)}</>}
              />
            )}
          </>
        }
      />

      <section className="fx-section" id="sec-territoire">
        <div className="fx-wrap">
          <SectionHead
            title={
              <>
                {t("fx.inv.s05.title.before")}
                <em>{t("fx.inv.s05.title.em")}</em>
                {t("fx.inv.s05.title.after")}
              </>
            }
            subtitle={
              territoryView === "carte"
                ? fill(t("fx.inv.s03.sub"), { n: fmtInt(d.nbGeo) })
                : t("fx.inv.s05.sub")
            }
          />
          {supportsTerritoryViews ? (
            <>
              <div className="fx-view-toggle" role="tablist" aria-label={t("fx.inv.s05.kind")}>
                <button
                  type="button"
                  role="tab"
                  aria-selected={territoryView === "carte"}
                  className={`fx-view-toggle-btn ${territoryView === "carte" ? "is-active" : ""}`}
                  onClick={() => setTerritoryView("carte")}
                >
                  {t("fx.toc.carte")}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={territoryView === "liste"}
                  className={`fx-view-toggle-btn ${territoryView === "liste" ? "is-active" : ""}`}
                  onClick={() => setTerritoryView("liste")}
                >
                  {t("fx.toc.arrondissements")}
                </button>
              </div>
              {territoryView === "carte" ? (
                <>
                  <ProjectMap points={d.geoPoints} year={d.year} height={620} />
                  <p className="fx-note">
                    <b>{t("fx.inv.s03.note.b")}</b> :{" "}
                    {fill(t("fx.inv.s03.note"), { pct: fmtDec(100 - d.pctGeo, 0) })}
                  </p>
                  <ChartSource
                    source={fill(t("fx.inv.s03.source.cite"), { year: d.year })}
                    dataHref="https://opendata.paris.fr/explore/dataset/comptes-administratifs-budgets-principaux-a-partir-de-2019-m57-ville-departement/"
                    methodAnchor="investissements"
                  />
                </>
              ) : (
                <>
                  <ParisChoropleth
                    items={d.byArrondissement.map((a) => ({ arr: a.arr, amount: a.amount, count: a.count }))}
                    height={420}
                  />
                  <ChartSource
                    source={fill(t("fx.inv.s04.source.cite"), { year: d.year })}
                    dataHref="https://opendata.paris.fr/explore/dataset/comptes-administratifs-budgets-principaux-a-partir-de-2019-m57-ville-departement/"
                    methodAnchor="investissements"
                  />
                </>
              )}
            </>
          ) : (
            // Non-Paris: simple ranking list (no SVG choropleth, no map).
            // Source: pre-aggregated byArrondissement coming from the city loader.
            <>
              <ol className="fx-arr-ranking" aria-label={t("fx.toc.arrondissements")}>
                {d.byArrondissement.map((a, i) => (
                  <li key={a.arr} className="fx-arr-ranking-item">
                    <span className="fx-arr-ranking-rank">{String(i + 1).padStart(2, "0")}</span>
                    <span className="fx-arr-ranking-label">
                      {a.arr}
                      {arrSuf(a.arr)} {t("fx.inv.rank.district")}
                    </span>
                    <span className="fx-arr-ranking-amount">
                      {a.amount >= 1e6 ? `${fmtMillions(a.amount, 1)} M€` : `${fmtInt(a.amount / 1000)} k€`}
                    </span>
                    <span className="fx-arr-ranking-count">
                      {fmtInt(a.count)} {a.count === 1 ? t("fx.inv.rank.project_one") : t("fx.inv.rank.project_many")}
                    </span>
                  </li>
                ))}
              </ol>
              <ChartSource
                source={fill(t("fx.inv.s04.source.cite"), { year: d.year })}
                methodAnchor="investissements"
              />
            </>
          )}
          {(() => {
            const parHab = d.total / cityPopulation(citySlug);
            const topChap = d.byChapitre[0];
            const topAmt = topChap ? fmtMillions(topChap.amount, 0) : "";
            const topLabel = topChap ? trL(topChap.label) : "";
            const baseVars = {
              year: d.year,
              total: fmtBillions(d.total),
              nb: fmtInt(d.nbProjets),
              perHab: fmtInt(parHab),
            };
            const topPart = topChap
              ? fill(t("fx.inv.hook.share.top"), { label: topLabel, topAmt })
              : "";
            return (
              <PageHook
                variant="card"
                cite={fill(t("fx.inv.hook.cite"), { year: d.year })}
                shareText={fill(t("fx.inv.hook.share"), { ...baseVars, topPart })}
              >
                <span dangerouslySetInnerHTML={{ __html: fill(t("fx.inv.hook.body.intro"), baseVars) }} />
                {topChap ? (
                  <span dangerouslySetInnerHTML={{ __html: fill(t("fx.inv.hook.body.top"), { label: topLabel, topAmt }) }} />
                ) : null}
              </PageHook>
            );
          })()}
        </div>
      </section>

      {/* « Par exemple » — même grammaire que la page marchés : trois
       * projets réels, règles fixes, photo dédiée exigée (cf. loader). */}

      <section className="fx-section" id="sec-chapitre">
        <div className="fx-wrap">
          <SectionHead
            title={
              <>
                {t("fx.inv.s04.title.before")}
                <em><Tip label={t("fx.inv.classif_fonct.tip")}>{t("fx.inv.s04.title.em")}</Tip></em>
              </>
            }
            subtitle={t("fx.inv.s04.sub")}
          />
          <StackedBarTheme
            items={d.byChapitre.map((c) => ({ theme: c.label, amount: c.amount, count: c.count }))}
            total={d.total}
            concentrationTop10Pct={d.top10ProjetsPct}
            year={d.year}
            basePath={cityBasePath}
            kicker={fill(t("fx.inv.s04.kicker"), { year: d.year })}
            entityNoun={t("fx.inv.s04.entity_noun")}
            paretoContrast={t("fx.inv.s04.pareto_contrast")}
            hrefBuilder={(theme) => `${cityBasePath}/chapitre/${slugifyChapitre(theme)}`}
          />
          <ChartSource
            source={fill(t("fx.inv.s02.source.cite"), { year: d.year })}
            dataHref={isParis ? "https://opendata.paris.fr/explore/dataset/comptes-administratifs-budgets-principaux-a-partir-de-2019-m57-ville-departement/" : undefined}
            methodAnchor="investissements"
          />
        </div>
      </section>

      <section className="fx-section" id="sec-evolution">
        <div className="fx-wrap">
          <SectionHead
            title={
              <>
                {t("fx.inv.s06.title.before")}
                <em>{fill(t("fx.inv.s06.title.em"), { year: d.year })}</em>
              </>
            }
          />
          <BudgetTimeline
            points={ytrend.map((y) => ({
              year: y.year,
              value: y.total / 1_000_000_000,
              type: "execute" as const,
            }))}
            activeYear={d.year}
          />
          <ChartSource
            source={t("fx.inv.s05.source.cite")}
            dataHref={isParis ? "https://opendata.paris.fr/explore/dataset/comptes-administratifs-budgets-principaux-a-partir-de-2019-m57-ville-departement/" : undefined}
            methodAnchor="investissements"
          />
          <p className="fx-note">
            <b>{t("fx.inv.s06.note.b")}</b> :{" "}
            {fill(t("fx.inv.s06.note"), { pct: Math.round(100 - d.pctGeo) })}
          </p>
        </div>
      </section>


      <section className="fx-section" id="sec-projets">
        <div className="fx-wrap">
          <SectionHead
            title={
              <>
                {t("fx.inv.s01.title.before")}
                <em>{t("fx.inv.s01.title.em")}</em>
                {fill(t("fx.inv.s01.title.after"), { year: d.year })}
              </>
            }
          />
          <div className="fx-projet-grid">
            {d.topProjets.slice(0, 12).map((p, i) => (
              <Link
                key={p.id}
                href={`${cityBasePath}/projet/${encodeURIComponent(p.id)}`}
                className="fx-projet-card"
                scroll={false}
              >
                <div className="fx-projet-card-thumb">
                  <ProjetThumb photo={p.photo.photo} generic={p.photo.generic} typologie={p.photo.typologie} aspectRatio="4 / 3" fallbackLabel={p.name} />
                </div>
                <div className="fx-projet-card-body">
                  <div className="fx-projet-card-rank">{String(i + 1).padStart(2, "0")}</div>
                  <div className="fx-projet-card-name">{((locale === 'en' && p.name_en) ? p.name_en : p.name ?? "—").slice(0, 90)}</div>
                  <div className="fx-projet-card-meta">
                    <span>
                      {p.arr > 0
                        ? fill(t("fx.inv.s01.arr"), { n: p.arr }) + arrSuf(p.arr)
                        : t("fx.s.transverse")}
                    </span>
                    <span className="fx-projet-card-amount">
                      {p.amount >= 1e6 ? `${fmtMillions(p.amount, 1)} M€` : `${fmtInt(p.amount / 1000)} k€`}
                    </span>
                  </div>
                  <div className="fx-projet-card-chapitre">{trL(p.chapitre)}</div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <RelatedArticles posts={posts} placeholders={INV_PLACEHOLDERS} />

      <section className="fx-footer-sources" id="sec-sources">
        <div className="fx-wrap">
          <div className="fx-footer-sources-head">
            <span className="fx-footer-sources-label">{t("fx.s.sources_exports")}</span>
            <a href="/methode#investissements" className="fx-footer-sources-methode">{t("fx.s.methode_complete")}</a>
          </div>
          <p className="fx-footer-sources-meta">
            <b>{t("fx.footer.source_label")}</b> : {t("fx.inv.footer.source")} <span className="sep">·</span> <b>{t("fx.footer.coverage_label")}</b> : {t("fx.inv.footer.coverage")}
          </p>
          <ExportRow
            items={[
              {
                label: fill(t("fx.inv.src.export.csv"), { year: d.year }),
                primary: true,
                href: isParis
                  ? `/data/map/investissements_complet_${d.year}.json`
                  : `/data/${citySlug}/investissements/investissements_${d.year}.json`,
              },
              {
                label: t("fx.inv.src.export.json"),
                href: isParis
                  ? `/data/map/investissements_complet_${d.year}.json`
                  : `/data/${citySlug}/investissements/investissements_${d.year}.json`,
              },
              {
                label: t("fx.inv.src.export.trend"),
                href: isParis
                  ? "/data/investissement_tendances.json"
                  : `/data/${citySlug}/investissements/investissement_tendances.json`,
              },
              { label: t("fx.inv.src.export.method"), href: "/methode?tool=investissements#outils" },
            ]}
          />
        </div>
      </section>

      </main>
      <Footer />
    </div>
  );
}
