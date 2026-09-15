"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "@/components/LocalizedLink";
import { usePathname } from "@/lib/navigation";
import { citySlugFromPathname } from "@/lib/methodology";
import Navbar from "@/components/fusion/Navbar";
import Footer from "@/components/fusion/Footer";
import AnneesRail, { RAIL_MIN } from "@/components/fusion/AnneesRail";
import ParisChoropleth from "@/components/fusion/ParisChoropleth";
import SectionHero from "@/components/fiche/SectionHero";
import ShareButton from "@/components/fiche/ShareButton";
import Bars, { type BarRow } from "@/components/fiche/Bars";
import { Door, NextDoor } from "@/components/fiche/Doors";
import { V3Fold, V3Foot, V3Row, V3Section, foldRest } from "@/components/fiche/v3";
import { useFmt, useFmtEur } from "@/lib/use-fmt";
import { fill, sufOrdinal } from "@/lib/fmt";
import { useLocale, useT } from "@/lib/localeContext";
import { useTrack } from "@/lib/analyticsContext";
import { trLabel } from "@/lib/label-translate";
import { slugifyChapitre } from "@/lib/projet-utils";
import type { BlogPostMeta } from "@/lib/blog";
import type { InvestissementsData } from "@/lib/fusion-data";

// Leaflet only when someone asks for the map: one click since April on the
// markers, so the page does not pay for it on load.
const ProjectMap = dynamic(() => import("@/components/fusion/ProjectMap"), { ssr: false, loading: () => <div className="fx-sec-map-wait" aria-hidden="true" /> });

/** The two ways « Où » is drawn: bars by arrondissement (with the choropleth), or the markers map. */
type WhereView = "arrondissements" | "carte";
const WHERE_VIEWS: WhereView[] = ["arrondissements", "carte"];

const CITY_NAMES: Record<string, string> = { paris: "Paris", marseille: "Marseille" };
/** One hue, light to dark, ending on the site's blue (--bleu #2a3680). */
const CHORO_BLUE = ["#e6e9f4", "#bcc3e2", "#8b96c7", "#5262a5", "#2a3680"];
const PROJETS_CAP = 8;
const ARR_CAP = 5;
const EX_KIND: Record<InvestissementsData["exemples"][number]["kind"], string> = {
  gros: "fx.sec.inv.ex.gros",
  chantier: "fx.sec.inv.ex.chantier",
  quotidien: "fx.sec.inv.ex.quotidien",
};

/**
 * La section « Investissements » sur la grammaire des fiches (2026-09-15) :
 * le chiffre (la dépense d'investissement de l'année, hors dette) avec son
 * rail, UNE scène qui fait la somme du chiffre — par chapitre, vers les
 * fiches chapitre —, puis la matière de cette section : trois chantiers en
 * photo choisis par règle (le plus gros, le plus de contrats, un équipement
 * du quotidien) et les plus gros chantiers en lignes, face à « Où, dans
 * Paris » qui porte SON chiffre (les opérations nommées ne couvrent qu'une
 * part du total) — barres par arrondissement avec la choroplèthe, la carte à
 * marqueurs sur demande —, « Comprendre » en replis, « Voir aussi », la
 * section suivante. Marseille partage la page : sans chapitres, la scène est
 * « Où », sans photos ni carte.
 */
export default function InvestissementsClient({ d, posts, doors, enableDrilldowns = true }: {
  d: InvestissementsData;
  posts: BlogPostMeta[];
  /** Numbers for the doors, loaded by the page (absent on cities without them). */
  doors?: {
    budget?: { year: number; total: number; voted: boolean } | null;
    marches?: { year: number; total: number } | null;
    next?: { year: number; total: number; count: number } | null;
    lieux?: { count: number } | null;
  };
  /** Whether chapitre / projet / arrondissement fiches exist for this city. */
  enableDrilldowns?: boolean;
}) {
  const t = useT();
  const { locale } = useLocale();
  const track = useTrack();
  const fmt = useFmt();
  const { fmtDec, fmtCompactEur } = fmt;
  // Inter draws the narrow no-break space of « 1 122 » as almost nothing.
  const fmtInt = (n: number) => fmt.fmtInt(n).replace(/ /g, " ");
  const fmtEur = useFmtEur();
  const citySlug = citySlugFromPathname(usePathname());
  const cityName = CITY_NAMES[citySlug] ?? citySlug.charAt(0).toUpperCase() + citySlug.slice(1);
  const cityBase = `/france/${citySlug}`;
  const invBase = `${cityBase}/investissements`;
  const isParis = citySlug === "paris";
  const total = fmtCompactEur(d.total);
  const eurTxt = (n: number) => { const f = fmtEur(n); return `${f.v} ${f.u}`; };
  const Amt = ({ n }: { n: number }) => { const f = fmtEur(n); return <span className="fx-v3-amt tnum" style={{ fontSize: 14 }}>{f.v}<span className="u">{f.u}</span></span>; };
  const arrTxt = (n: number) => `${n}${sufOrdinal(n, locale)}`;
  const named = (n: number) => fill(t(n === 1 ? "fx.sec.inv.n_named_one" : "fx.sec.inv.n_named"), { n: fmtInt(n) });
  const years = d.availableYears.slice().sort((a, b) => a - b);

  // The number's grey line: what the named operations weigh against it. Two
  // measures meet here (the year's spending, the operations' voted amounts):
  // the share is said as a share, and « Comprendre » says the difference.
  const hasNamed = d.nbProjets > 0 && d.projetsAmount > 0;
  const meta = hasNamed
    ? fill(t("fx.sec.inv.meta"), { n: fmtInt(d.nbProjets), amount: eurTxt(d.projetsAmount), pct: fmtDec(d.projetsCoveragePct, 0) })
    : undefined;

  // The movement under the number: the year against the one before, in ocre,
  // naming the chapter that explains at least a third of the change.
  const prev = d.yearsSummary.filter((y) => y.year < d.year && y.horsDette > 0).sort((a, b) => b.year - a.year)[0];
  const move = prev
    ? (() => {
        const pct = ((d.total - prev.horsDette) / prev.horsDette) * 100;
        if (Math.abs(pct) < 0.5) return fill(t("fx.sec.mp.move_flat"), { year: prev.year });
        const base = fill(t(pct > 0 ? "fx.sec.mp.move_up" : "fx.sec.mp.move_down"), { pct: fmtDec(Math.abs(pct), 0), year: prev.year });
        const tc = d.prevMove?.year === prev.year ? d.prevMove.topChapitre : null;
        return tc
          ? base + fill(t("fx.sec.mp.move_of_which"), { sign: tc.delta > 0 ? "+" : "−", amount: eurTxt(Math.abs(tc.delta)), label: trLabel(tc.label, locale).toLocaleLowerCase(locale) })
          : base;
      })()
    : undefined;

  const series = d.yearsSummary.filter((y) => y.horsDette > 0).map((y) => ({ year: y.year, amount: y.horsDette }));
  const shareTitle = fill(t("fx.sec.inv.share_title"), { city: cityName, total: `${total.value} ${total.unit}`, year: d.year });

  // The scene: the chapters, which sum to the number. Each opens its fiche.
  const chapLabel = (label: string) => (label.toLowerCase() === "rsa" ? "RSA" : trLabel(label, locale));
  const chapRows: BarRow[] = d.byChapitre.map((c) => ({
    key: c.label,
    label: chapLabel(c.label),
    value: c.amount,
    text: eurTxt(c.amount),
    sub: c.count > 0 ? named(c.count) : undefined,
    href: enableDrilldowns ? `${invBase}/chapitre/${slugifyChapitre(c.label)}` : null,
  }));
  // Without a chapter split (Marseille), « Où » is the scene.
  const lite = chapRows.length === 0;

  // « Où » — its own number: the named operations, by arrondissement.
  const [where, setWhere] = useState<WhereView>("arrondissements");
  const hasMap = isParis && d.geoPoints.length > 0;
  const pickWhere = (v: WhereView) => {
    if (v === where) return;
    track("filter_change", { page: "investissements", field: "where_view", value: v });
    setWhere(v);
  };
  const arrRows: BarRow[] = d.byArrondissement.map((a) => ({
    key: String(a.arr),
    label: fill(t("fx.sec.inv.arr_label"), { arr: arrTxt(a.arr) }),
    value: a.amount,
    text: eurTxt(a.amount),
    sub: named(a.count),
    href: enableDrilldowns ? `${invBase}/arrondissement/${a.arr}` : null,
  }));
  // « Où » counts what sits in an arrondissement: the choropleth's total is
  // that, not the number's line (2024: 412 of the 437, 25 are citywide).
  const nLoc = d.byArrondissement.reduce((s, a) => s + a.count, 0);
  const amountLoc = d.byArrondissement.reduce((s, a) => s + a.amount, 0);
  const nTransverse = Math.max(0, d.nbProjets - nLoc);
  const whereSub = nLoc > 0
    ? fill(t("fx.sec.inv.where_sub"), { n: fmtInt(nLoc), amount: eurTxt(amountLoc) })
    : undefined;
  const whereSection = d.byArrondissement.length > 0 ? (
    <V3Section id="where" title={fill(t("fx.sec.inv.h.where"), { city: cityName })} sub={whereSub}>
      {hasMap ? (
        <div className="fx-sec-switch" role="group" aria-label={t("fx.sec.inv.g.aria")}>
          {WHERE_VIEWS.map((v) => (
            <button key={v} type="button" aria-pressed={where === v} onClick={() => pickWhere(v)}>{t(`fx.sec.inv.g.${v}`)}</button>
          ))}
        </div>
      ) : null}
      <div id="ou">
        {where === "carte" && hasMap ? (
          <ProjectMap points={d.geoPoints} year={d.year} height={480} />
        ) : (
          <>
            {isParis ? (
              <div className="fx-sec-choro">
                {/* The tiles open the arrondissement fiche under the city's path (the
                    component's default href predates /france/paris). Blue ramp: on this
                    page the bars are blue and ocre is the movement only. */}
                <ParisChoropleth
                  items={d.byArrondissement.map((a) => ({ arr: a.arr, amount: a.amount, count: a.count }))}
                  height={290}
                  showRanking={false}
                  palette={CHORO_BLUE}
                  hrefFor={enableDrilldowns ? (arr) => `${invBase}/arrondissement/${arr === 0 ? 1 : arr}` : () => null}
                />
              </div>
            ) : null}
            <Bars rows={arrRows} cap={ARR_CAP} foldId="more-arr" foldLabel={fill(t("fx.sec.inv.arr_more"), { n: fmtInt(d.byArrondissement.length) })} />
          </>
        )}
      </div>
      <ShareButton label={t("fx.sec.share_chart")} done={t("fx.sec.shared")} title={shareTitle} object={`where_${where}`} anchor="ou" />
    </V3Section>
  ) : null;

  // The largest named worksites, in rows; the rest behind one fold. The list
  // is complete: the largest one is also the first photo a screen above, under
  // the kicker that says so.
  const projets = foldRest(d.topProjets, PROJETS_CAP);
  const ProjetRow = (p: InvestissementsData["topProjets"][number]) => (
    <V3Row key={p.id} href={enableDrilldowns ? `${invBase}/projet/${encodeURIComponent(p.id)}` : null}
      label={(locale === "en" && p.name_en) || p.name}
      subText={[p.arr > 0 ? arrTxt(p.arr) : t("fx.sec.inv.transverse"), p.chapitre && p.chapitre !== "—" ? chapLabel(p.chapitre) : null].filter(Boolean).join(" · ")}
      amount={<Amt n={p.amount} />} />
  );
  const projetsSection = d.topProjets.length > 0 ? (
    <V3Section id="projects" title={fill(t("fx.sec.inv.h.projects"), { year: d.year })}>
      {projets.shown.map(ProjetRow)}
      {projets.rest.length > 0 && <V3Fold id="more-projects" text label={t("fx.v3.voir_plus")}>{projets.rest.map(ProjetRow)}</V3Fold>}
    </V3Section>
  ) : null;

  // Three real worksites with a real photo, chosen by rule: the material of
  // this section, under the years rail so the first screen holds the number,
  // its curve and three things it built (the blank that sat there before).
  // The card's kicker names the kind when it is known: « Une école du
  // quotidien » says what « Bruneseau Nord - 8 classes » is.
  const QUOTIDIEN_KINDS = new Set(["ecole", "creche", "piscine", "bibliotheque", "gymnase", "college", "lycee"]);
  const kickerOf = (e: InvestissementsData["exemples"][number]) =>
    e.kind === "quotidien" && e.typologie && QUOTIDIEN_KINDS.has(e.typologie) ? t(`fx.sec.inv.ex.quotidien.${e.typologie}`) : t(EX_KIND[e.kind]);
  const examplesSection = !lite && d.exemples.length > 0 ? (
    <V3Section id="examples" title={fill(t("fx.sec.inv.h.examples"), { year: d.year })}>
      <div className="fx-sec-ex">
        {d.exemples.map((e) => {
          const href = `${invBase}/projet/${encodeURIComponent(e.id)}`;
          const name = (locale === "en" && e.nameEn) || e.name;
          return (
            <figure key={e.id} className="fx-sec-ex-card" data-block="photo">
              <Link href={href} scroll={false} className="fx-sec-ex-img" aria-hidden="true" tabIndex={-1}>
                <img src={e.photoUrl} alt="" loading="lazy" />
              </Link>
              <figcaption>
                <span className="k">{kickerOf(e)}</span>
                <Link href={href} scroll={false} className="t">{name} ›</Link>
                <span className="s">
                  {[
                    e.arr > 0 ? arrTxt(e.arr) : t("fx.sec.inv.transverse"),
                    eurTxt(e.amount),
                    e.nbMarches > 0 ? fill(t(e.nbMarches === 1 ? "fx.sec.inv.n_contracts_one" : "fx.sec.inv.n_contracts"), { n: e.nbMarches }) : null,
                  ].filter(Boolean).join(" · ")}
                </span>
                {e.photoCredit ? <span className="c">{fill(t("fx.sec.mp.photo_credit"), { credit: e.photoCredit })}</span> : null}
              </figcaption>
            </figure>
          );
        })}
      </div>
    </V3Section>
  ) : null;

  const pctNoGeo = d.nbProjets > 0 ? Math.max(0, 100 - d.pctGeo) : 0;

  return (
    <div className="theme-fusion">
      <Navbar />
      <main id="main-content" tabIndex={-1}>
        <div className="fx-sec fx-v3">
          <div className="fx-sec-kicker fx-page-kicker fx-page-kicker--links"><Link href={cityBase}>{cityName}</Link> › {t("fx.sec.inv.kicker")}</div>
          <div className="fx-sec-grid" data-layout={lite ? undefined : "chantiers"}>
            <div className="fx-sec-a-hero">
              <SectionHero
                title={t("fx.sec.inv.title")}
                value={total.value}
                unit={total.unit}
                captionBefore={t("fx.sec.inv.cap_before")}
                captionAfter={t("fx.sec.inv.cap_after")}
                years={years}
                year={d.year}
                basePath={invBase}
                meta={meta}
                move={move}
                shareTitle={shareTitle}
              />
              {series.length >= RAIL_MIN ? (
                <div className="fx-sec-years" data-section="years">
                  <div className="fx-page-kicker">{t("fx.sec.years")}</div>
                  <AnneesRail rows={series} current={d.year} />
                </div>
              ) : null}
              {examplesSection}
            </div>

            <div className="fx-sec-a-scene">
              {lite ? whereSection : (
                <V3Section id="scene" title={fill(t("fx.sec.inv.h.scene"), { year: d.year })} sub={t("fx.sec.inv.scene_sub")}>
                  <div id="chapitres">
                    <Bars rows={chapRows} />
                  </div>
                  <ShareButton label={t("fx.sec.share_chart")} done={t("fx.sec.shared")} title={shareTitle} object="scene_chapitre" anchor="chapitres" />
                </V3Section>
              )}
            </div>

            {/* Band 2: the largest worksites face « Où ». Without chapters (Marseille)
                « Où » is already the scene and the rows face « Voir aussi ». */}
            <div className="fx-sec-a-rows">{projetsSection}</div>
            {lite ? null : <div className="fx-sec-a-where">{whereSection}</div>}

            <div className="fx-sec-a-understand">
              <V3Section id="understand" title={t("fx.sec.understand")}>
                <V3Fold id="measure" label={t("fx.sec.inv.u.measure")}><p className="fx-v3-sentence">{t("fx.sec.inv.u.measure_body")}</p></V3Fold>
                {hasNamed ? (
                  <V3Fold id="named" label={fill(t("fx.sec.inv.u.named"), { pct: fmtDec(d.projetsCoveragePct, 0) })}>
                    <p className="fx-v3-sentence">
                      {fill(t(isParis ? "fx.sec.inv.u.named_body" : "fx.sec.inv.u.named_body_city"), { n: fmtInt(d.nbProjets), amount: eurTxt(d.projetsAmount), pct: fmtDec(d.projetsCoveragePct, 0) })}
                      {nTransverse > 0 ? fill(t("fx.sec.inv.u.named_transverse"), { t: fmtInt(nTransverse) }) : null}
                      {hasMap && pctNoGeo >= 1 ? fill(t("fx.sec.inv.u.named_geo"), { pctNoGeo: fmtDec(pctNoGeo, 0) }) : null}
                    </p>
                  </V3Fold>
                ) : null}
                <V3Fold id="sources" label={t("fx.sec.inv.u.source")}>
                  <p className="fx-v3-sentence">{t(isParis ? "fx.sec.inv.u.source_body" : "fx.sec.inv.u.source_body_city")}</p>
                  <p className="fx-v3-sentence">
                    {isParis ? (
                      <>
                        <a href="https://opendata.paris.fr/explore/dataset/comptes-administratifs-budgets-principaux-a-partir-de-2019-m57-ville-departement/" target="_blank" rel="noopener noreferrer">opendata.paris.fr ↗</a>
                        {" · "}
                        <a href={`/data/map/investissements_complet_${d.year}.json`} target="_blank" rel="noopener noreferrer">JSON {d.year} ↗</a>
                        {" · "}
                        <a href="/data/investissement_tendances.json" target="_blank" rel="noopener noreferrer">{t("fx.sec.inv.u.trend")} ↗</a>
                      </>
                    ) : (
                      <>
                        <a href={`/data/${citySlug}/investissements/investissements_${d.year}.json`} target="_blank" rel="noopener noreferrer">JSON {d.year} ↗</a>
                        {" · "}
                        <a href={`/data/${citySlug}/investissements/investissement_tendances.json`} target="_blank" rel="noopener noreferrer">{t("fx.sec.inv.u.trend")} ↗</a>
                      </>
                    )}
                    {" · "}
                    <Link href="/methode?tool=investissements#outils">{t("fx.s.methode_complete")}</Link>
                  </p>
                </V3Fold>
              </V3Section>
            </div>

            <div className="fx-sec-a-related">
              <V3Section id="related" title={t("fx.sec.see_also")}>
                {/* Doors are named like the sections in the menu; the year and the number sit in the grey line and at the right. */}
                {doors?.budget ? (
                  <Door href={`${cityBase}/budget?year=${doors.budget.year}`} hard title={t("fx.sec.inv.r.budget")} sub={fill(t(doors.budget.voted ? "fx.sec.inv.r.budget_sub_vote" : "fx.sec.inv.r.budget_sub"), { year: doors.budget.year })} value={fmtCompactEur(doors.budget.total).value} unit={fmtCompactEur(doors.budget.total).unit} />
                ) : (
                  <Door href={`${cityBase}/budget`} hard title={t("fx.sec.inv.r.budget")} sub={t("fx.sec.inv.r.budget_sub_noyear")} />
                )}
                {doors?.marches ? (
                  <Door href={`${cityBase}/marches?year=${doors.marches.year}`} hard title={t("fx.sec.inv.r.marches")} sub={fill(t("fx.sec.inv.r.marches_sub"), { year: doors.marches.year })} value={fmtCompactEur(doors.marches.total).value} unit={fmtCompactEur(doors.marches.total).unit} />
                ) : (
                  <Door href={`${cityBase}/marches`} hard title={t("fx.sec.inv.r.marches")} sub={t("fx.sec.inv.r.marches_sub_noyear")} />
                )}
                <Door href={`${cityBase}/lieux`} hard title={t("fx.sec.inv.r.lieux")} sub={t("fx.sec.inv.r.lieux_sub")} value={doors?.lieux && doors.lieux.count > 0 ? fmtInt(doors.lieux.count) : undefined} unit={doors?.lieux && doors.lieux.count > 0 ? t("fx.sec.inv.r.lieux_unit") : undefined} />
                {enableDrilldowns ? (
                  <Door href={`${invBase}/projets`} hard title={t("fx.sec.inv.r.index")} sub={t("fx.sec.inv.r.index_sub")} />
                ) : null}
                {posts.map((p) => (
                  <V3Row key={p.slug} href={`/analyses/${p.slug}`} label={p.title} subText={t("fx.sec.inv.r.read")} />
                ))}
              </V3Section>
            </div>

            <div className="fx-sec-a-next">
              <NextDoor
                href={`${cityBase}/subventions${doors?.next ? `?year=${doors.next.year}` : ""}`}
                kicker={t("fx.sec.next")}
                title={t("fx.sec.inv.next")}
                sub={doors?.next ? fill(t("fx.sec.inv.next_sub_n"), { n: fmtInt(doors.next.count), year: doors.next.year }) : t("fx.sec.inv.next_sub")}
                value={doors?.next ? fmtCompactEur(doors.next.total).value : undefined}
                unit={doors?.next ? fmtCompactEur(doors.next.total).unit : undefined}
              />
            </div>

            <div className="fx-sec-a-foot">
              <V3Foot>{t(isParis ? "fx.sec.inv.foot" : "fx.sec.inv.foot_city")}</V3Foot>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
