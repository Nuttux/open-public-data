"use client";
import { useState } from "react";
import Link from "@/components/LocalizedLink";
import { usePathname } from "@/lib/navigation";
import { citySlugFromPathname } from "@/lib/methodology";
import Navbar from "@/components/fusion/Navbar";
import Footer from "@/components/fusion/Footer";
import AnneesRail, { RAIL_MIN } from "@/components/fusion/AnneesRail";
import SruDeviationBars from "@/components/fusion/SruDeviationBars";
import SectionHero from "@/components/fiche/SectionHero";
import ShareButton from "@/components/fiche/ShareButton";
import Bars, { type BarRow } from "@/components/fiche/Bars";
import { Door, NextDoor } from "@/components/fiche/Doors";
import { V3Fold, V3Foot, V3Row, V3Section } from "@/components/fiche/v3";
import DataAlert, { DATA_ALERTS_ON } from "@/components/fusion/DataAlert";
import { useFmt } from "@/lib/use-fmt";
import { fill, sufOrdinal } from "@/lib/fmt";
import { useLocale, useT } from "@/lib/localeContext";
import { useTrack } from "@/lib/analyticsContext";
import { trLabel } from "@/lib/label-translate";
import { slugifyBailleur } from "@/lib/projet-utils";
import type { BlogPostMeta } from "@/lib/blog";
import type { LogementSocialData, SruArrondissementsData } from "@/lib/fusion-data";

/** The three ways the scene cuts the arrondissements. One chart, one switch. */
type Group = "part" | "financed" | "attente";
const CITY_NAMES: Record<string, string> = { paris: "Paris", marseille: "Marseille" };
const ARR_CAP = 8;

/**
 * La section « Logement social » sur la grammaire des fiches (2026-09-15) : le
 * chiffre que les gens cherchent — la part de logements sociaux, contre les
 * 25 % de la loi — avec les deux autres questions en ligne grise (le parc, les
 * logements financés dans l'année, les ménages en attente) et le rail des
 * logements financés ; UNE scène, les vingt arrondissements, en trois
 * lentilles : la part (la ligne des 25 %, le graphe que les lecteurs lisent),
 * les financés de l'année, les demandes par attribution ; puis qui gère le
 * parc face à la file d'attente ; « Comprendre » face à « Voir aussi » ; la
 * section suivante. Marseille partage la page sans la part par arrondissement
 * ni la file d'attente.
 */
export default function LogementClient({ d, sruArr, posts, doors }: {
  d: LogementSocialData;
  sruArr: SruArrondissementsData | null;
  posts: BlogPostMeta[];
  /** Numbers for the doors, loaded by the page (absent on cities without them). */
  doors?: {
    garanties?: { year: number; total: number } | null;
    budget?: { year: number; total: number; voted: boolean } | null;
    invest?: { year: number; total: number } | null;
    next?: { year: number; total: number } | null;
  };
}) {
  const t = useT();
  const { locale } = useLocale();
  const track = useTrack();
  const fmt = useFmt();
  const { fmtDec, fmtCompactEur } = fmt;
  // Inter draws the narrow no-break space of « 258 400 » as almost nothing.
  const fmtInt = (n: number) => fmt.fmtInt(n).replace(/ /g, " ");
  const citySlug = citySlugFromPathname(usePathname());
  const cityName = CITY_NAMES[citySlug] ?? citySlug.charAt(0).toUpperCase() + citySlug.slice(1);
  const cityBase = `/france/${citySlug}`;
  const base = `${cityBase}/logement`;
  const isParis = citySlug === "paris";
  const tension = d.tension;
  const arrTxt = (n: number) => `${n}${sufOrdinal(n, locale)}`;
  const units = (n: number) => fill(t(n === 1 ? "fx.sec.log.n_units_one" : "fx.sec.log.n_units"), { n: fmtInt(n) });
  const ops = (n: number) => fill(t(n === 1 ? "fx.sec.log.n_ops_one" : "fx.sec.log.n_ops"), { n: fmtInt(n) });
  // The arrondissement fiches: Paris Centre for 1-4, one route per other arrondissement.
  const arrHref = (arr: number) => (isParis ? `${base}/arrondissement/${arr <= 4 ? "paris-centre" : arr}` : null);

  // The number: the share, against the law's target. The grey line carries
  // the two other questions. No year menu: the inventory has one date.
  const meta = tension
    ? fill(t("fx.sec.log.meta"), { stock: fmtInt(d.stockTotal), financed: fmtInt(d.nouveauxParAn), year: d.year, demandes: fmtInt(tension.paris.demandesActives) })
    : fill(t("fx.sec.log.meta_notension"), { stock: fmtInt(d.stockTotal), financed: fmtInt(d.nouveauxParAn), year: d.year });
  const series = d.yearsSummary.filter((y) => y.logements > 0).map((y) => ({ year: y.year, amount: y.logements }));
  const shareTitle = fill(t("fx.sec.log.share_title"), { city: cityName, pct: fmtDec(d.sruRatio, 1), year: d.sruYear });

  // The scene: the same twenty arrondissements, three lenses.
  const hasPart = !!sruArr && sruArr.arrondissements.length > 0;
  const hasAttente = !!tension && tension.parArrondissement.length > 0;
  const groups: Group[] = [...(hasPart ? ["part" as const] : []), "financed", ...(hasAttente ? ["attente" as const] : [])];
  const [group, setGroup] = useState<Group>(groups[0]);
  const pickGroup = (g: Group) => {
    if (g === group) return;
    track("filter_change", { page: "logement", field: "scene_group", value: g });
    setGroup(g);
  };
  const financedRows: BarRow[] = d.byArrondissement
    .filter((a) => a.logements > 0)
    .slice()
    .sort((a, b) => b.logements - a.logements)
    .map((a) => ({
      key: String(a.arr),
      label: fill(t("fx.sec.log.arr_label"), { arr: arrTxt(a.arr) }),
      value: a.logements,
      text: units(a.logements),
      sub: ops(a.operations),
      href: arrHref(a.arr),
    }));
  const attenteRows: BarRow[] = (tension?.parArrondissement ?? [])
    .slice()
    .sort((a, b) => b.ratio - a.ratio)
    .map((a) => ({
      key: String(a.arr),
      label: fill(t("fx.sec.log.arr_label"), { arr: arrTxt(a.arr) }),
      value: a.ratio,
      text: fill(t("fx.sec.log.attente_text"), { r: fmtDec(a.ratio, 0) }),
      sub: fill(t("fx.sec.log.attente_sub"), { d: fmtInt(a.demandesActives), a: fmtInt(a.attributions) }),
      href: arrHref(a.arr),
    }));

  const groupLabel = (g: Group) => (g === "financed" ? fill(t("fx.sec.log.g.financed"), { year: d.year }) : t(`fx.sec.log.g.${g}`));

  return (
    <div className="theme-fusion">
      <Navbar />
      <main id="main-content" tabIndex={-1}>
        <div className="fx-sec fx-v3">
          <div className="fx-sec-kicker fx-page-kicker fx-page-kicker--links"><Link href={cityBase}>{cityName}</Link> › {t("fx.sec.log.kicker")}</div>
          {/* Bands: the share, its rail and the waiting list face the twenty
              arrondissements (a tall chart); the landlords face « Voir aussi »;
              « Comprendre » runs across. */}
          <div className="fx-sec-grid">
            <div className="fx-sec-a-hero">
              <SectionHero
                title={fill(t("fx.sec.log.title"), { city: cityName })}
                value={fmtDec(d.sruRatio, 1)}
                unit="%"
                captionBefore={t("fx.sec.log.cap_before")}
                captionAfter={fill(t("fx.sec.log.cap_after"), { target: d.sruTarget })}
                years={[d.sruYear]}
                year={d.sruYear}
                basePath={base}
                meta={meta}
                shareTitle={shareTitle}
              />
              {series.length >= RAIL_MIN ? (
                <div className="fx-sec-years" data-section="years">
                  <div className="fx-page-kicker">{t("fx.sec.log.rail")}</div>
                  <AnneesRail rows={series} current={d.year} format={(n) => units(n)} />
                </div>
              ) : null}
              {tension ? (
                // The third question, under the number: four facts, and what the delay means.
                <V3Section id="attente" title={fill(t("fx.sec.log.h.attente"), { year: tension.year })}>
                  <V3Row label={t("fx.sec.log.attente.demandes")} amount={<span className="fx-v3-amt tnum" style={{ fontSize: 14 }}>{fmtInt(tension.paris.demandesActives)}</span>} />
                  <V3Row label={t("fx.sec.log.attente.attribs")} amount={<span className="fx-v3-amt tnum" style={{ fontSize: 14 }}>{fmtInt(tension.paris.attributions)}</span>} />
                  <V3Row label={t("fx.sec.log.attente.ratio")} amount={<span className="fx-v3-amt tnum" style={{ fontSize: 14 }}>{fmtDec(tension.paris.ratio, 0)}</span>} />
                  {tension.paris.delaiMedianMois != null ? (
                    <V3Row label={t("fx.sec.log.attente.delai")} amount={<span className="fx-v3-amt tnum" style={{ fontSize: 14 }}>{fmtDec(tension.paris.delaiMedianMois, 0)}<span className="u">{t("fx.sec.log.attente.delai_unit")}</span></span>} />
                  ) : null}
                  <p className="fx-v3-note">{t("fx.sec.log.attente_foot")}</p>
                </V3Section>
              ) : null}
            </div>

            <div className="fx-sec-a-scene">
              <V3Section id="scene" title={t("fx.sec.log.h.scene")} hint={t("fx.sec.log.scene_sub")}>
                {groups.length > 1 ? (
                  <div className="fx-sec-switch" role="group" aria-label={t("fx.sec.log.g.aria")}>
                    {groups.map((g) => (
                      <button key={g} type="button" aria-pressed={group === g} onClick={() => pickGroup(g)}>{groupLabel(g)}</button>
                    ))}
                  </div>
                ) : null}
                <div className="fx-sec-scene-body" id="arrondissements">
                  {group === "part" && sruArr ? (
                    <>
                      {/* The 25 % line, the chart the readers spend their 46 seconds on: kept as it is. */}
                      <SruDeviationBars
                        rows={sruArr.arrondissements.map((a) => ({
                          arr: a.arr,
                          label: a.label,
                          tauxPct: a.latest.taux_pct,
                          href: `${base}/arrondissement/${a.arr}`,
                          title: `${fmtInt(a.latest.logements_sociaux)} / ${fmtInt(a.latest.residences_principales)} (${a.latest.year})`,
                        }))}
                        targetPct={d.sruTarget}
                        targetLabel={fill(t("fx.log.sruarr.target_label"), { target: d.sruTarget })}
                        vintageLabel={fill(t("fx.log.sruarr.vintage"), { year: sruArr.latest_year })}
                        legendBelow={fill(t("fx.log.sruarr.legend.below"), { target: d.sruTarget })}
                        legendAbove={fill(t("fx.log.sruarr.legend.above"), { target: d.sruTarget })}
                      />
                      {sruArr.latest_year !== d.sruYear ? (
                        <p className="fx-v3-note">{fill(t("fx.sec.log.part_note"), { year: sruArr.latest_year, sruYear: d.sruYear })}</p>
                      ) : null}
                    </>
                  ) : group === "attente" ? (
                    <>
                      <p className="fx-v3-note">{fill(t("fx.sec.log.attente_note"), { year: tension?.year ?? d.year })}</p>
                      <Bars key="attente" rows={attenteRows} cap={ARR_CAP} foldId="more-arr-attente" foldLabel={fill(t("fx.sec.log.arr_more"), { n: fmtInt(attenteRows.length) })} />
                    </>
                  ) : (
                    <>
                      <p className="fx-v3-note">{fill(t("fx.sec.log.financed_note"), { year: d.year })}</p>
                      <Bars key="financed" rows={financedRows} cap={ARR_CAP} foldId="more-arr" foldLabel={fill(t("fx.sec.log.arr_more"), { n: fmtInt(financedRows.length) })} />
                    </>
                  )}
                </div>
                <ShareButton label={t("fx.sec.share_chart")} done={t("fx.sec.shared")} title={shareTitle} object={`scene_${group}`} anchor="arrondissements" />
              </V3Section>
            </div>

            <div className="fx-sec-a-rows">
              {d.bailleurs.length > 0 ? (
                <V3Section id="bailleurs" title={t("fx.sec.log.h.bailleurs")} sub={t("fx.sec.log.bailleurs_sub")}>
                  {d.bailleurs.map((b) => (
                    <V3Row key={b.name}
                      href={isParis && !/^autres/i.test(b.name) ? `${cityBase}/dette/bailleur/${slugifyBailleur(b.name)}` : null}
                      label={trLabel(b.name, locale)}
                      subText={trLabel(b.type, locale)}
                      amount={<span className="fx-v3-amt tnum" style={{ fontSize: 14 }}>{b.share}<span className="u">{t("fx.sec.log.bailleur_unit")}</span></span>} />
                  ))}
                </V3Section>
              ) : null}
            </div>

            <div className="fx-sec-a-understand">
              <V3Section id="understand" title={t("fx.sec.understand")}>
                <V3Fold id="measure" label={t("fx.sec.log.u.measure")}><p className="fx-v3-sentence">{fill(t("fx.sec.log.u.measure_body"), { target: d.sruTarget })}</p></V3Fold>
                <V3Fold id="financed" label={t("fx.sec.log.u.financed")}><p className="fx-v3-sentence">{t("fx.sec.log.u.financed_body")}</p></V3Fold>
                {tension ? <V3Fold id="attente" label={t("fx.sec.log.u.attente")}><p className="fx-v3-sentence">{t("fx.sec.log.u.attente_body")}</p></V3Fold> : null}
                <V3Fold id="sources" label={t("fx.sec.log.u.source")}>
                  <p className="fx-v3-sentence">{isParis ? fill(t("fx.sec.log.u.source_body"), { year: sruArr?.latest_year ?? d.sruYear }) : t("fx.sec.log.u.source_body_city")}</p>
                  <p className="fx-v3-sentence">
                    {isParis ? (
                      <>
                        <a href="https://opendata.paris.fr/explore/dataset/logements-sociaux-finances-a-paris/" target="_blank" rel="noopener noreferrer">opendata.paris.fr ↗</a>
                        {" · "}
                        <a href="https://opendata.apur.org/datasets/Apur::logement-social20012019" target="_blank" rel="noopener noreferrer">APUR ↗</a>
                        {tension ? <>{" · "}<a href={tension.sourceUrl} target="_blank" rel="noopener noreferrer">DRIHL ↗</a></> : null}
                        {" · "}
                        <a href={`/data/map/arrondissements_stats_${d.year}.json`} target="_blank" rel="noopener noreferrer">JSON {d.year} ↗</a>
                      </>
                    ) : (
                      <a href={`/data/${citySlug}/logement/logement_data.json`} target="_blank" rel="noopener noreferrer">JSON ↗</a>
                    )}
                    {" · "}
                    <Link href="/methode?tool=logement-social#outils">{t("fx.s.methode_complete")}</Link>
                  </p>
                </V3Fold>
              </V3Section>
            </div>

            <div className="fx-sec-a-related">
              <V3Section id="related" title={t("fx.sec.see_also")}>
                {doors?.garanties ? (
                  <Door href={`${cityBase}/dette#sec-hors-bilan`} hard title={t("fx.sec.log.r.garanties")} sub={fill(t("fx.sec.log.r.garanties_sub"), { year: doors.garanties.year })} value={fmtCompactEur(doors.garanties.total).value} unit={fmtCompactEur(doors.garanties.total).unit} />
                ) : null}
                {doors?.budget ? (
                  <Door href={`${cityBase}/budget?year=${doors.budget.year}`} hard title={t("fx.sec.log.r.budget")} sub={fill(t(doors.budget.voted ? "fx.sec.log.r.budget_sub_vote" : "fx.sec.log.r.budget_sub"), { year: doors.budget.year })} value={fmtCompactEur(doors.budget.total).value} unit={fmtCompactEur(doors.budget.total).unit} />
                ) : (
                  <Door href={`${cityBase}/budget`} hard title={t("fx.sec.log.r.budget")} sub={t("fx.sec.log.r.budget_sub_noyear")} />
                )}
                {doors?.invest ? (
                  <Door href={`${cityBase}/investissements?year=${doors.invest.year}`} hard title={t("fx.sec.log.r.invest")} sub={fill(t("fx.sec.log.r.invest_sub"), { year: doors.invest.year })} value={fmtCompactEur(doors.invest.total).value} unit={fmtCompactEur(doors.invest.total).unit} />
                ) : (
                  <Door href={`${cityBase}/investissements`} hard title={t("fx.sec.log.r.invest")} sub={t("fx.sec.log.r.invest_sub_noyear")} />
                )}
                {posts.map((p) => (
                  <V3Row key={p.slug} href={`/analyses/${p.slug}`} label={p.title} subText={t("fx.sec.log.r.read")} />
                ))}
              </V3Section>
            </div>

            <div className="fx-sec-a-next">
              <NextDoor
                href={`${cityBase}/dette${doors?.next ? `?year=${doors.next.year}` : ""}`}
                kicker={t("fx.sec.next")}
                title={t("fx.sec.log.next")}
                sub={doors?.next ? fill(t("fx.sec.log.next_sub_n"), { year: doors.next.year }) : t("fx.sec.log.next_sub")}
                value={doors?.next ? fmtCompactEur(doors.next.total).value : undefined}
                unit={doors?.next ? fmtCompactEur(doors.next.total).unit : undefined}
              />
            </div>

            <div className="fx-sec-a-foot">
              {DATA_ALERTS_ON && isParis ? <DataAlert section="logement" /> : null}
              <V3Foot>{t(isParis ? "fx.sec.log.foot" : "fx.sec.log.foot_city")}</V3Foot>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
