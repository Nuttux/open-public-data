"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Navbar from "@/components/fusion/Navbar";
import Footer from "@/components/fusion/Footer";
import SectionHead from "@/components/fusion/SectionHead";
import SruDeviationBars from "@/components/fusion/SruDeviationBars";
import AnimatedNumber from "@/components/fusion/AnimatedNumber";
import BudgetTimeline from "@/components/fusion/BudgetTimeline";
import PageTOC from "@/components/fusion/PageTOC";
import ParisChoropleth from "@/components/fusion/ParisChoropleth";
import TensionParArrondissement from "@/components/fusion/TensionParArrondissement";
import ChartSource from "@/components/fusion/ChartSource";
import YearPicker from "@/components/fusion/YearPicker";
import ExportRow from "@/components/fusion/ExportRow";
import Tip from "@/components/fusion/Tip";
import RelatedArticles, { type ArticlePlaceholder } from "@/components/fusion/RelatedArticles";
import PageHook from "@/components/fusion/PageHook";
import PageIntro, { IntroStat } from "@/components/fusion/PageIntro";
import { fill, fmtDec, fmtInt } from "@/lib/fmt";
import type { BlogPostMeta } from "@/lib/blog";
import type { LogementSocialData, SruArrondissementsData } from "@/lib/fusion-data";
import { useT, useLocale } from "@/lib/localeContext";
import { trLabel } from "@/lib/label-translate";
import { slugifyBailleur } from "@/lib/projet-utils";
import { citySlugFromPathname } from "@/lib/methodology";


/** Produces 5-7 rounded Y-axis ticks covering [min, max] with a nice round
 *  step (1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, …). Returned top→bottom. */
const niceYTicks = (min: number, max: number, target = 5): number[] => {
  if (max <= min) return [max];
  const niceSteps = [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000];
  const rawStep = (max - min) / target;
  const step = niceSteps.find((s) => s >= rawStep) ?? niceSteps[niceSteps.length - 1];
  const top = Math.ceil(max / step) * step;
  const bottom = Math.max(0, Math.floor(min / step) * step);
  const ticks: number[] = [];
  for (let v = top; v >= bottom - 1e-9; v -= step) ticks.push(Math.round(v));
  return ticks;
};

const LOG_PLACEHOLDERS: ArticlePlaceholder[] = [
  {
    category: "Enquête",
    title: "Bailleurs sociaux parisiens : qui détient quoi, qui finance quoi.",
    description:
      "Paris Habitat, RIVP, Elogie-Siemp — structure, gouvernance, dette. Une cartographie comparée des trois principaux opérateurs du parc.",
  },
  {
    category: "Explication",
    title: "SRU, PLU-bioclimatique, conventionnement : comment le stock évolue.",
    description:
      "Les trois leviers qui font bouger la part de logement social dans un arrondissement, leur rythme et leurs limites.",
  },
];

export default function LogementSocialClient({
  d,
  sruArr,
  posts,
}: {
  d: LogementSocialData;
  sruArr: SruArrondissementsData | null;
  posts: BlogPostMeta[];
}) {
  const t = useT();
  const { locale } = useLocale();
  // Detect current city from URL — Paris uses the rich Choropleth + Tension
  // pipeline ; other cities (Marseille v1) drop §02/§05/§06 silently when
  // their data is unavailable (P3.2 option a).
  const pathname = usePathname();
  const citySlug = citySlugFromPathname(pathname);
  const isParis = citySlug === "paris";
  const cityBasePath = `/fr/city/${citySlug}/logement`;
  const tension = d.tension;
  const hasTension = tension !== null;
  const hasBailleurs = d.bailleurs.length > 0;
  const gap = d.sruRatio - d.sruTarget;

  return (
    <div className="theme-fusion">
      <Navbar />
      <main id="main-content" tabIndex={-1}>

      <PageTOC
        items={[
          { id: "sec-sru-arr", label: t("fx.toc.sruarr") },
          ...(hasBailleurs ? [{ id: "sec-bailleurs", label: t("fx.toc.bailleurs") }] : []),
          { id: "sec-territoire", label: t("fx.log.s02.kind") },
          { id: "sec-production", label: t("fx.toc.production") },
          ...(hasTension
            ? [
                { id: "sec-tension-arr", label: t("fx.log.toc.par_arr") },
              ]
            : []),
          { id: "sec-analyses", label: t("fx.toc.analyses") },
          { id: "sec-sources", label: t("fx.toc.sources") },
        ]}
      />

      <PageIntro
        title={
          <>
            {t("fx.log.title.before")}
            <em>{t("fx.log.title.em")}</em>
            {t("fx.log.title.mid")} {t("fx.log.title.b")}
            <b>{t("fx.log.title.b_b")}</b>
            {t("fx.log.title.b_after")}
          </>
        }
        lede={
          <>
            {t("fx.log.lede.prefix")}
            <Tip label={t("fx.log.sru.tip")}>{t("fx.log.lede.sru")}</Tip>
            {t("fx.log.lede.mid1")}
            <Tip label={t("fx.log.bailleur.tip")}>{t("fx.log.lede.bailleurs")}</Tip>
            {t("fx.log.lede.mid2")}
            <Tip label={t("fx.log.ddt.tip")}>{t("fx.log.lede.ddt")}</Tip>
            {t("fx.log.lede.mid3")}
            <Tip label={t("fx.log.lede.ca.tip")}>{t("fx.log.lede.ca")}</Tip>
            {fill(t("fx.log.lede.suffix"), { year: d.year })}
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
              value={<AnimatedNumber value={d.sruRatio} format={(n) => fmtDec(n, 1)} />}
              unit="%"
              label={<Tip label={t("fx.log.sru.tip")}>{fill(t("fx.log.s01.hero_label"), { year: d.sruYear })}</Tip>}
            />
            <IntroStat
              value={<AnimatedNumber value={d.stockTotal} format={(n) => fmtInt(n)} />}
              label={<Tip label={t("fx.log.s01.kpi.stock.tip")}>{t("fx.log.s01.kpi.stock")}</Tip>}
            />
            <IntroStat
              value={<AnimatedNumber value={d.nouveauxParAn} format={(n) => fmtInt(n)} />}
              label={fill(t("fx.log.s01.kpi.new"), { year: d.year })}
            />
            <IntroStat
              value={<AnimatedNumber value={gap} format={(n) => `${n >= 0 ? "+" : "−"} ${fmtDec(Math.abs(n), 1)} pt`} />}
              label={<>{t("fx.log.s01.kpi.ecart")} · {fill(t("fx.log.sruarr.target_label"), { target: d.sruTarget })}</>}
            />
          </>
        }
      />

      {/* §01 — Vue d'ensemble SRU */}

      {sruArr && (
        <section className="fx-section" id="sec-sru-arr">
          <div className="fx-wrap">
            <SectionHead
              title={
                <>
                  {t("fx.log.sruarr.title.before")}
                  <em>{t("fx.log.sruarr.title.em")}</em>
                  {t("fx.log.sruarr.title.after")}
                </>
              }
              subtitle={fill(t("fx.log.sruarr.sub"), { year: sruArr.latest_year, target: d.sruTarget })}
            />
            <SruDeviationBars
              rows={sruArr.arrondissements.map((a) => ({
                arr: a.arr,
                label: a.label,
                tauxPct: a.latest.taux_pct,
                href: `/fr/city/paris/logement/arrondissement/${a.arr}`,
                title: `${fmtInt(a.latest.logements_sociaux)} logements sociaux / ${fmtInt(a.latest.residences_principales)} résidences principales (${a.latest.year})`,
              }))}
              targetPct={d.sruTarget}
              targetLabel={fill(t("fx.log.sruarr.target_label"), { target: d.sruTarget })}
              vintageLabel={fill(t("fx.log.sruarr.vintage"), { year: sruArr.latest_year })}
              legendBelow={fill(t("fx.log.sruarr.legend.below"), { target: d.sruTarget })}
              legendAbove={fill(t("fx.log.sruarr.legend.above"), { target: d.sruTarget })}
            />
            <p className="fx-note">{fill(t("fx.log.sruarr.note"), { ratio: fmtDec(d.sruRatio, 1), ratioYear: d.sruYear, dataYear: sruArr.latest_year })}</p>
          <p className="fx-note">
            <b>{t("fx.log.s04.sru_target_label")}</b> : {t("fx.log.s04.sru_target_note")}
          </p>
          {hasTension && tension && (() => {
            const arrsCouverts = d.byArrondissement.filter((a) => a.logements > 0).length;
            const demandes = tension.paris.demandesActives;
            const attribs = tension.paris.attributions;
            const ratio = attribs > 0 ? Math.round(demandes / attribs) : 0;
            return (
              <PageHook
                variant="card"
                cite={
                  <>
                    {fill(t("fx.log.hookblock.cite"), { year: d.year })}
                  </>
                }
                shareText={fill(t("fx.log.hookblock.share"), {
                  year: d.year,
                  demandes: fmtInt(demandes),
                  attribs: fmtInt(attribs),
                  nouveaux: fmtInt(d.nouveauxParAn),
                  ratio,
                })}
              >
                <b>{fill(t("fx.log.hookblock.body.menages"), { n: fmtInt(demandes) })}</b>
                {t("fx.log.hookblock.body.attendent")}
                {fill(t("fx.log.hookblock.body.en_year"), { year: d.year })}
                <b>{fmtInt(attribs)}</b>
                {t("fx.log.hookblock.body.et_finance")}{" "}
                <b>{fill(t("fx.log.hookblock.body.nouveaux"), { n: fmtInt(d.nouveauxParAn) })}</b>
                {t("fx.log.hookblock.body.dans")}{" "}
                <b>{fill(t("fx.log.hookblock.body.arrs"), { n: arrsCouverts })}</b>
                {t("fx.log.hookblock.body.soit")}{" "}
                <b>{fill(t("fx.log.hookblock.body.ratio"), { ratio })}</b>.
              </PageHook>
            );
          })()}
            <ChartSource
              source={t("fx.log.sruarr.source.cite")}
              dataHref="https://opendata.apur.org/datasets/Apur::logement-social20012019"
              methodAnchor="logement"
            />
          </div>
        </section>
      )}

      {/* §02 — Bailleurs (Paris : cards cliquables vers /dette/bailleur ;
          autres villes : cards rendues comme blocs simples — pas de routes
          drill-down en POC). */}
      {hasBailleurs && (
        <section className="fx-section" id="sec-bailleurs">
          <div className="fx-wrap">
            <SectionHead
              title={
                <>
                  {t("fx.log.s03.title.before")}
                  <em><Tip label={t("fx.log.bailleur.tip")}>{t("fx.log.s03.title.em")}</Tip></em>
                  {t("fx.log.s03.title.after")}
                </>
              }
              subtitle={t("fx.log.s03.sub")}
            />
            <div className="fx-bailleurs-grid">
              {d.bailleurs.map((b) => {
                const cardContent = (
                  <>
                    <div className="n">{trLabel(b.type, locale)}</div>
                    <h3>{trLabel(b.name, locale)}</h3>
                    <p>{trLabel(b.description, locale)}</p>
                    <div className="fx-bailleur-share-row">
                      <span className="fx-bailleur-share">~{b.share} %</span>
                      <span className="fx-bailleur-share-unit">{t("fx.log.s03.du_parc")}</span>
                    </div>
                  </>
                );
                return isParis ? (
                  <Link
                    key={b.name}
                    href={`/fr/city/${citySlug}/dette/bailleur/${slugifyBailleur(b.name)}`}
                    className="fx-bailleur-card"
                  >
                    {cardContent}
                  </Link>
                ) : (
                  <div key={b.name} className="fx-bailleur-card">
                    {cardContent}
                  </div>
                );
              })}
            </div>
            <p className="fx-note">
              <b>{t("fx.s.methode")}</b> : {t("fx.log.s03.note")}
            </p>
          </div>
        </section>
      )}

      {/* §03 — Où */}
      <section className="fx-section" id="sec-territoire">
        <div className="fx-wrap">
          <SectionHead
            title={
              <>
                {t("fx.log.s02.title.before")}
                <em>{t("fx.log.s02.title.em")}</em>
                {fill(t("fx.log.s02.title.after"), { city: citySlug.charAt(0).toUpperCase() + citySlug.slice(1) })}
              </>
            }
            subtitle={t("fx.log.s02.sub")}
          />
          {isParis ? (
            <>
              <ParisChoropleth
                items={d.byArrondissement.map((a) => ({
                  arr: a.arr,
                  amount: a.logements,
                  count: a.operations,
                }))}
                formatValue={(n) => `${fmtInt(n)} ${t("fx.log.s02.unit_long")}`}
                unitLabel={t("fx.log.s02.unit_ops")}
                hrefFor={(cAr) =>
                  `${cityBasePath}/arrondissement/${cAr === 0 ? "paris-centre" : cAr}`
                }
              />
              <p className="fx-mini-note">{t("fx.log.s02.paris_centre_note")}</p>
            </>
          ) : (
            // Non-Paris cities : ParisChoropleth is hard-coded to Paris SVG paths.
            // Until DistrictChoropleth (PA.4 GeoJSON) ships, render the same data
            // as horizontal bars — no drill-down (routes /arrondissement/[arr]
            // not created for Marseille v1).
            <ul className="fx-arr-bars" aria-label={t("fx.log.s02.unit_ops")}>
              {(() => {
                const sorted = [...d.byArrondissement].sort((a, b) => b.logements - a.logements);
                const max = sorted.length > 0 ? sorted[0].logements : 0;
                return sorted.map((a) => {
                  const w = max > 0 ? Math.max(2, Math.round((a.logements / max) * 100)) : 0;
                  return (
                    <li key={a.arr} className="fx-arr-bar">
                      <span className="fx-arr-bar-label">
                        {a.arr}
                        {a.arr === 1 ? "er" : "ᵉ"} arr.
                      </span>
                      <span className="fx-arr-bar-track" aria-hidden>
                        <span className="fx-arr-bar-fill" style={{ width: `${w}%` }} />
                      </span>
                      <span className="fx-arr-bar-value tnum">{fmtInt(a.logements)}</span>
                    </li>
                  );
                });
              })()}
            </ul>
          )}
          <ChartSource
            source={<>{t("fx.log.s02.source")}</>}
            dataHref="https://www.legifrance.gouv.fr/loda/id/JORFTEXT000000207538/"
            methodAnchor="logement-social"
          />
        </div>
      </section>

      {/* §04 — Production annuelle */}
      <section className="fx-section" id="sec-production">
        <div className="fx-wrap">
          <SectionHead
            title={
              <>
                {t("fx.log.s04.title.before")}
                <em><Tip label={t("fx.log.s04.kind.tip")}>{t("fx.log.s04.title.em")}</Tip></em>
                {t("fx.log.s04.title.after")}
              </>
            }
            subtitle={t("fx.log.s04.sub")}
          />
          {(() => {
            const vals = d.yearsSummary.map((y) => y.logements);
            const ticks = niceYTicks(Math.min(...vals), Math.max(...vals));
            return (
              <>
                <div className="fx-y-axis-label">{t("fx.log.s04.y_label")}</div>
                <BudgetTimeline
                  points={d.yearsSummary.map((y) => ({
                    year: y.year,
                    value: y.logements,
                    type: "execute" as const,
                  }))}
                  activeYear={d.year}
                  annotations={isParis ? [
                    { year: 2020, label: t("fx.log.s04.ann.covid") },
                    { year: 2024, label: t("fx.log.s04.ann.jo") },
                  ] : []}
                  yTicks={ticks}
                  formatYTick={(v) => fmtInt(v)}
                  activeBadge={`${d.year} · ${fmtInt(d.nouveauxParAn)} ${t("fx.log.s02.unit_long")}`}
                  showStatus={false}
                  ariaLabel={t("fx.log.s04.aria")}
                />
              </>
            );
          })()}
          <p className="fx-note">
            <b>{t("fx.s.limite")}</b> : {t("fx.log.s04.note")}
          </p>
          <ChartSource
            source={<>{t("fx.log.s04.source")}</>}
            dataHref="https://opendata.paris.fr/explore/dataset/logements-sociaux-finances-a-paris/"
            methodAnchor="logement-social"
          />
        </div>
      </section>


      {/* §06 — Tension par arrondissement (source DRIHL — IDF-only) */}
      {hasTension && tension && (
        <section className="fx-section" id="sec-tension-arr">
          <div className="fx-wrap">
            <SectionHead
              title={
                <>
                  {t("fx.log.s06b.title.before")}
                  <em>{t("fx.log.s06b.title.em")}</em>
                  {t("fx.log.s06b.title.after")}
                </>
              }
              subtitle={fill(t("fx.log.s06b.subtitle"), { year: tension.year })}
            />
            <TensionParArrondissement
              year={tension.year}
              source={tension.source}
              sourceUrl={tension.sourceUrl}
              paris={tension.paris}
              parArrondissement={tension.parArrondissement}
              methodology={{
                ratioDefinition: t("fx.log.methodology.ratio_definition"),
                delaiMedianCaveat: t("fx.log.methodology.delai_median_caveat"),
              }}
            />
          </div>
        </section>
      )}

      <RelatedArticles posts={posts} placeholders={LOG_PLACEHOLDERS} />

      {/* §08 — Sources & exports */}

      {/* §08 — Explorer plus loin */}
      <section className="fx-footer-sources" id="sec-sources">
        <div className="fx-wrap">
          <div className="fx-footer-sources-head">
            <span className="fx-footer-sources-label">{t("fx.s.sources_exports")}</span>
            <a href="/methode#logement-social" className="fx-footer-sources-methode">{t("fx.s.methode_complete")}</a>
          </div>
          <p className="fx-footer-sources-meta">
            <b>{t("fx.log.footer.source_label")}</b> {t("fx.log.footer.source_value")} <span className="sep">·</span> <b>{t("fx.log.footer.coverage_label")}</b> {t("fx.log.footer.coverage_value")}
          </p>
          <ExportRow
            items={
              isParis
                ? [
                    {
                      label: fill(t("fx.log.src.export.csv"), { year: d.year }),
                      primary: true,
                      href: `/data/map/arrondissements_stats_${d.year}.json`,
                    },
                    { label: t("fx.log.src.export.geo"), href: "/data/map/arrondissements.geojson" },
                    { label: t("fx.log.src.export.method"), href: "/methode?tool=logement-social#outils" },
                  ]
                : [
                    {
                      label: t("fx.log.src.export.csv_city"),
                      primary: true,
                      href: `/data/${citySlug}/logement/logement_data.json`,
                    },
                    { label: t("fx.log.src.export.method"), href: "/methode?tool=logement-social#outils" },
                  ]
            }
          />
        </div>
      </section>

      </main>
      <Footer />
    </div>
  );
}
