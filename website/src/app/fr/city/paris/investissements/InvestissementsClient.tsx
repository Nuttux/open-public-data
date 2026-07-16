"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Navbar from "@/components/fusion/Navbar";
import Footer from "@/components/fusion/Footer";
import SectionHead from "@/components/fusion/SectionHead";
import ChartSource from "@/components/fusion/ChartSource";
import HeroNumber from "@/components/fusion/HeroNumber";
import KPIGrid from "@/components/fusion/KPIGrid";
import AnimatedNumber from "@/components/fusion/AnimatedNumber";
import TileCard from "@/components/fusion/TileCard";
import YearPicker from "@/components/fusion/YearPicker";
import ExportRow from "@/components/fusion/ExportRow";
import Tip from "@/components/fusion/Tip";
import ProjectMap from "@/components/fusion/ProjectMap";
import ProjetThumb from "@/components/fusion/ProjetThumb";
import FriseChantiers from "@/components/fusion/FriseChantiers";
import ParisChoropleth from "@/components/fusion/ParisChoropleth";
import BudgetTimeline from "@/components/fusion/BudgetTimeline";
import StackedBarTheme from "@/components/fusion/StackedBarTheme";
import PageTOC from "@/components/fusion/PageTOC";
import RelatedArticles, { type ArticlePlaceholder } from "@/components/fusion/RelatedArticles";
import PageHook from "@/components/fusion/PageHook";
import { fmtBillions, fmtDec, fmtInt, fmtMillions } from "@/lib/fmt";
import type { BlogPostMeta } from "@/lib/blog";
import type { InvestissementsData , FriseChantiersData } from "@/lib/fusion-data";
import { slugifyChapitre } from "@/lib/projet-utils";
import { useT, useLocale } from "@/lib/localeContext";
import { trLabel } from "@/lib/label-translate";
import { cityPopulation, citySlugFromPathname } from "@/lib/methodology";

const fill = (s: string, vars: Record<string, string | number>) => {
  let r = s;
  for (const [k, v] of Object.entries(vars)) r = r.split(`{${k}}`).join(String(v));
  return r;
};

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
  frise,
  posts,
}: {
  d: InvestissementsData;
  frise: FriseChantiersData | null;
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
  const cityMarchesPath = `/fr/city/${citySlug}/marches`;
  const cityLogementPath = `/fr/city/${citySlug}/logement`;
  const cityDettePath = `/fr/city/${citySlug}/dette`;
  const isParis = citySlug === "paris";
  const ytrend = d.yearsSummary;
  const delta5y =
    ytrend.length >= 2
      ? ((ytrend[ytrend.length - 1].total - ytrend[0].total) / ytrend[0].total) * 100
      : 0;
  const delta5yDir: "up" | "down" | "flat" = delta5y > 0.1 ? "up" : delta5y < -0.1 ? "down" : "flat";

  const arrSuf = (n: number) => (n === 1 ? t("fx.s.arr.1_suffix") : t("fx.s.arr.suffix"));
  // Paris has both a geolocated map (ProjectMap) and a SVG choropleth wired
  // to its 1-20 arrondissements. Non-Paris cities fall back to a simple
  // ranking list (P3.2 option a stricte: the map+choropleth section
  // disappears when the underlying data isn't there). The toggle is hidden
  // for non-Paris.
  const supportsTerritoryViews = isParis && d.geoPoints.length > 0;
  const [territoryView, setTerritoryView] = useState<"carte" | "liste">("liste");

  return (
    <div className="theme-fusion">
      <Navbar />
      <main id="main-content" tabIndex={-1}>

      <PageTOC
        items={[
          { id: "sec-overview", label: t("fx.toc.chiffres") },
          { id: "sec-chapitre", label: t("fx.toc.chapitres") },
          { id: "sec-territoire", label: t("fx.inv.s05.kind") },
          { id: "sec-evolution", label: t("fx.toc.evolution") },
          { id: "sec-frise", label: t("fx.toc.frise") },
          { id: "sec-projets", label: t("fx.toc.projets") },
          { id: "sec-analyses", label: t("fx.toc.analyses") },
          { id: "sec-explorer", label: t("fx.toc.explorer") },
          { id: "sec-sources", label: t("fx.toc.sources") },
        ]}
      />

      <section className="fx-page-header">
        <div className="fx-wrap">
          <div className="fx-page-kicker">{t("fx.inv.kicker")}</div>
          <h1 className="fx-page-title">
            {t("fx.inv.title.before")}
            <em>{t("fx.inv.title.em")}</em>
            {t("fx.inv.title.after")}
          </h1>
          <p className="fx-page-lede">
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
          </p>
          <div className="fx-page-actions">
            <YearPicker
              years={d.availableYears}
              current={d.year}
              basePath={cityBasePath}
              label={t("fx.s.year_label")}
            />
          </div>
        </div>
      </section>

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

      <section className="fx-section" id="sec-overview">
        <div className="fx-wrap">
          <SectionHead
            number="01"
            kind={t("fx.inv.s02.kind")}
            title={
              <>
                {t("fx.inv.s02.title.before")}
                <em>{t("fx.inv.s02.title.em")}</em>
                {t("fx.inv.s02.title.after")}
              </>
            }
          />
          <div className="fx-overview">
            <HeroNumber
              label={fill(t("fx.inv.s02.hero_label"), { year: d.year })}
              value={<AnimatedNumber value={d.total} format={(n) => fmtBillions(n)} />}
              unit={t("fx.s.md_eur")}
              delta={{
                direction: delta5yDir,
                value: <AnimatedNumber value={Math.abs(delta5y)} format={(n) => `${fmtDec(n, 1)} %`} />,
                base: fill(t("fx.inv.s02.hero_base"), { year: String(ytrend[0]?.year ?? "") }),
              }}
              caption={
                <>
                  <Tip label={t("fx.inv.s02.hero_cap.a.term.tip")}>{t("fx.inv.s02.hero_cap.a.term")}</Tip>
                  {t("fx.inv.s02.hero_cap.a.post")}
                  <b>{fmtBillions(d.totalHorsDette)} {t("fx.s.md_eur")}</b>.{" "}
                  {t("fx.inv.s02.hero_cap.b")}
                </>
              }
            />
            <KPIGrid
              cols={2}
              items={[
                {
                  label: <Tip label={t("fx.inv.s02.kpi.projets.tip")}>{t("fx.inv.s02.kpi.projets")}</Tip>,
                  value: <AnimatedNumber value={d.nbProjets} format={(n) => fmtInt(n)} />,
                  delta: t("fx.inv.s02.kpi.projets_delta"),
                },
                {
                  label: <Tip label={t("fx.inv.s02.kpi.geo.tip")}>{t("fx.inv.s02.kpi.geo")}</Tip>,
                  value: <AnimatedNumber value={d.pctGeo} format={(n) => `${fmtDec(n, 0)} %`} />,
                  delta: fill(t("fx.inv.s02.kpi.geo_delta"), { n: fmtInt(d.nbGeo) }),
                },
                {
                  label: <Tip label={t("fx.inv.s02.kpi.top_chap.tip")}>{t("fx.inv.s02.kpi.top_chap")}</Tip>,
                  value: trL(d.byChapitre[0]?.label) || "—",
                  delta: d.byChapitre[0] ? fmtMillions(d.byChapitre[0].amount) + " M €" : "—",
                },
                {
                  label: t("fx.inv.s02.kpi.arr1"),
                  value: d.byArrondissement[0]
                    ? `${d.byArrondissement[0].arr}${arrSuf(d.byArrondissement[0].arr)}`
                    : "—",
                  delta: d.byArrondissement[0]
                    ? fmtMillions(d.byArrondissement[0].amount) + " M €"
                    : "—",
                },
              ]}
            />
          </div>
        </div>
      </section>

      <section className="fx-section" id="sec-chapitre">
        <div className="fx-wrap">
          <SectionHead
            number="02"
            kind={<Tip label={t("fx.inv.classif_fonct.tip")}>{t("fx.inv.s04.kind")}</Tip>}
            title={
              <>
                {t("fx.inv.s04.title.before")}
                <em>{t("fx.inv.s04.title.em")}</em>
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

      <section className="fx-section" id="sec-territoire">
        <div className="fx-wrap">
          <SectionHead
            number="03"
            kind={t("fx.inv.s05.kind")}
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
        </div>
      </section>

      <section className="fx-section" id="sec-evolution">
        <div className="fx-wrap">
          <SectionHead
            number="04"
            kind={t("fx.inv.s06.kind")}
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


      {frise && (
        <section className="fx-section" id="sec-frise">
          <div className="fx-wrap">
            <SectionHead
              number="05"
              kind={t("fx.inv.frise.kind")}
              title={
                <>
                  {t("fx.inv.frise.title.before")}
                  <em>{t("fx.inv.frise.title.em")}</em>
                  {t("fx.inv.frise.title.after")}
                </>
              }
              subtitle={fill(t("fx.inv.frise.sub"), { from: frise.from, to: frise.to, n: frise.perYear })}
            />
          </div>
          <FriseChantiers data={frise} ficheBase={cityBasePath} />
          <div className="fx-wrap">
            <p className="fx-note" style={{ marginTop: 18 }}>{t("fx.inv.frise.note")}</p>
          </div>
        </section>
      )}

      <section className="fx-section" id="sec-projets">
        <div className="fx-wrap">
          <SectionHead
            number="06"
            kind={t("fx.inv.s01.kind")}
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

      <RelatedArticles number="07" posts={posts} placeholders={INV_PLACEHOLDERS} />

      <section className="fx-section" id="sec-explorer">
        <div className="fx-wrap">
          <SectionHead number="08" kind={t("fx.inv.s09.kind")} />
          <div className="fx-grid-tiles">
            <TileCard
              href={cityMarchesPath}
              number={t("fx.inv.s09.t1.n")}
              kind={t("fx.inv.s09.t1.kind")}
              title={t("fx.inv.s09.t1.title")}
              description={t("fx.inv.s09.t1.desc")}
              preview={
                <svg viewBox="0 0 200 100">
                  <rect x="10" y="20" width="80" height="10" fill="#0a0a0a" />
                  <rect x="10" y="38" width="60" height="10" fill="#0a0a0a" />
                  <rect x="10" y="56" width="100" height="10" fill="#e11d1d" />
                  <rect x="10" y="74" width="40" height="10" fill="#0a0a0a" />
                </svg>
              }
              kpi="2,1"
              kpiUnit={t("fx.s.md_eur")}
              kpiDelta={fill(t("fx.inv.s09.t1.delta"), { year: d.year })}
            />
            <TileCard
              href={cityLogementPath}
              number={t("fx.inv.s09.t2.n")}
              kind={t("fx.inv.s09.t2.kind")}
              title={t("fx.inv.s09.t2.title")}
              description={t("fx.inv.s09.t2.desc")}
              preview={
                <svg viewBox="0 0 200 100">
                  <rect x="16" y="40" width="28" height="48" fill="#0a0a0a" />
                  <rect x="52" y="28" width="28" height="60" fill="#0a0a0a" />
                  <rect x="88" y="50" width="28" height="38" fill="#e11d1d" />
                  <rect x="124" y="20" width="28" height="68" fill="#0a0a0a" />
                  <rect x="160" y="36" width="28" height="52" fill="#0a0a0a" />
                </svg>
              }
              kpi="24,5"
              kpiUnit="%"
              kpiDelta={t("fx.inv.s09.t2.delta")}
            />
            <TileCard
              href={cityDettePath}
              number={t("fx.inv.s09.t3.n")}
              kind={t("fx.inv.s09.t3.kind")}
              title={t("fx.inv.s09.t3.title")}
              description={t("fx.inv.s09.t3.desc")}
              preview={
                <svg viewBox="0 0 200 100">
                  <rect x="32" y="10" width="60" height="40" fill="#0a0a0a" />
                  <rect x="32" y="52" width="60" height="24" fill="#0a0a0a" opacity=".75" />
                  <rect x="108" y="10" width="60" height="46" fill="#0a0a0a" />
                  <rect x="108" y="58" width="60" height="32" fill="#e11d1d" />
                </svg>
              }
              kpi="26"
              kpiUnit={t("fx.s.md_eur")}
              kpiDelta={t("fx.inv.s09.t3.delta")}
            />
          </div>
        </div>
      </section>

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
