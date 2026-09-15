"use client";
import { useState } from "react";
import Link from "@/components/LocalizedLink";
import { usePathname } from "@/lib/navigation";
import { cityPopulation, citySlugFromPathname } from "@/lib/methodology";
import Navbar from "@/components/fusion/Navbar";
import Footer from "@/components/fusion/Footer";
import AnneesRail, { RAIL_MIN } from "@/components/fusion/AnneesRail";
import SectionHero from "@/components/fiche/SectionHero";
import ShareButton from "@/components/fiche/ShareButton";
import { Door, NextDoor } from "@/components/fiche/Doors";
import { V3Fold, V3Foot, V3Row, V3Section, foldRest } from "@/components/fiche/v3";
import { useFmt, useFmtEur } from "@/lib/use-fmt";
import { fill } from "@/lib/fmt";
import { useLocale, useT, type Locale } from "@/lib/localeContext";
import { useTrack } from "@/lib/analyticsContext";
import { trLabel } from "@/lib/label-translate";
import { slugifyLabel } from "@/lib/projet-utils";
import { NATURE_GROUPS } from "@/lib/budget-natures";
import fonctionLabels from "@/data/budget-fonction-labels.json";
import type { BlogPostMeta } from "@/lib/blog";
import type { BudgetPageData } from "@/lib/fusion-data";

type FonctionLabel = { fr: string; en: string; sub_fr?: string; sub_en?: string };
const FONCTIONS: Record<string, FonctionLabel> = fonctionLabels as Record<string, FonctionLabel>;
/** Le libellé clair d'une mission, avec les mots de la fiche de poste. */
function missionLabel(key: string, locale: Locale): string {
  const fl = FONCTIONS[key];
  return fl ? (locale === "en" ? fl.en : fl.fr) : trLabel(key, locale);
}

type BudgetIndexLite = {
  availableYears: number[];
  votedYears?: number[];
  summary: { year: number; type_budget: "vote" | "execute" }[];
};

/** The two ways to read the spending column: the City's postes, or what kind
 *  of money it is (salaries, grants, works…). Revenue has its own column. */
type Group = "poste" | "nature";

const CITY_NAMES: Record<string, string> = { paris: "Paris", marseille: "Marseille" };
const LINES_CAP = 5;
const FLOW_GROUPS = NATURE_GROUPS.filter((g) => g.key !== "autres");

type Props = {
  index: BudgetIndexLite;
  d: BudgetPageData;
  posts: BlogPostMeta[];
  /** Numbers for the doors, loaded by the page (null where the city has none). */
  doors?: {
    marches?: { year: number; total: number } | null;
    subventions?: { year: number; total: number; count: number } | null;
    invest?: { year: number; total: number } | null;
  };
};

/**
 * La section « Budget » sur la grammaire des fiches (2026-09-15) : la
 * réponse (un chiffre, sa phrase avec l'année en menu, « voté » dit dans le
 * menu, la ligne grise, la tendance en ocre, « Partager ») avec le rail des
 * années en face, hachuré pour les années votées ; puis le tableau que Daniel
 * a voulu garder de la page d'avant : DÉPENSES ET RECETTES FACE À FACE, chaque
 * ligne avec sa petite courbe, son montant, sa part et son chevron, chaque
 * ligne ouvrant sa fiche ; la colonne des dépenses se lit par poste ou par
 * nature ; l'emprunt est séparé d'un trait en bas des recettes, et une phrase
 * dit l'écart en langage courant. Ensuite les plus grosses lignes,
 * « Comprendre », « Voir aussi » en portes chiffrées, la section suivante.
 * Partagée avec Marseille : sans nature (pas de flux), portes selon ce que
 * la ville publie.
 */
export default function BudgetClient({ index, d, posts, doors }: Props) {
  const t = useT();
  const { locale } = useLocale();
  const track = useTrack();
  const fmt = useFmt();
  const { fmtDec, fmtCompactEur } = fmt;
  // Inter draws the narrow no-break space of « 1 122 » as almost nothing.
  const fmtInt = (n: number) => fmt.fmtInt(n).replace(/ /g, " ");
  const fmtEur = useFmtEur();
  const pathname = usePathname();
  const citySlug = citySlugFromPathname(pathname);
  const cityName = CITY_NAMES[citySlug] ?? citySlug.charAt(0).toUpperCase() + citySlug.slice(1);
  const population = cityPopulation(citySlug);
  const cityBase = `/france/${citySlug}`;
  const budgetBase = `${cityBase}/budget`;
  const eurTxt = (n: number) => { const f = fmtEur(n); return `${f.v} ${f.u}`; };
  const Amt = ({ n }: { n: number }) => { const f = fmtEur(n); return <span className="fx-v3-amt tnum" style={{ fontSize: 14 }}>{f.v}<span className="u">{f.u}</span></span>; };
  const capFirst = (s: string) => (s ? s[0].toLocaleUpperCase(locale) + s.slice(1) : s);
  // « Autres (D) », « Personnel (R) » : the sankey's suffix is not a word for the reader.
  const label = (raw: string) => (raw.startsWith("Autres (") || raw.startsWith("Autre (") ? t("fx.bud.autres") : capFirst(trLabel(raw.replace(/\s\((D|R)\)$/, ""), locale)));

  /* ── The number: the year's spending, voted or executed ── */
  const yearType = index.summary.find((s) => s.year === d.year)?.type_budget ?? "execute";
  const isVoted = yearType === "vote";
  const votedYears = index.votedYears ?? [];
  const years = index.availableYears.slice().sort((a, b) => a - b);
  const total = fmtCompactEur(d.depenses);
  const prevYear = d.yearsSummary.filter((y) => y.year < d.year).sort((a, b) => b.year - a.year)[0];
  const move = prevYear && prevYear.depenses > 0
    ? (() => {
        const pct = ((d.depenses - prevYear.depenses) / prevYear.depenses) * 100;
        // One decimal: a budget moves by a few percent, unlike the contracts.
        if (Math.abs(pct) < 0.05) return fill(t("fx.sec.mp.move_flat"), { year: prevYear.year });
        return fill(t(pct > 0 ? "fx.sec.mp.move_up" : "fx.sec.mp.move_down"), { pct: fmtDec(Math.abs(pct), 1), year: prevYear.year });
      })()
    : undefined;
  const series = d.yearsSummary.filter((y) => y.depenses > 0).map((y) => ({ year: y.year, amount: y.depenses }));
  const provisional = d.yearsSummary.filter((y) => y.type === "vote").map((y) => y.year);
  const shareTitle = fill(t("fx.sec.bud.share_title"), { city: cityName, total: `${total.value} ${total.unit}`, year: d.year });
  const yearLabel = (y: number) => `${y} · ${t(votedYears.includes(y) ? "fx.sec.bud.voted_short" : "fx.sec.bud.executed_short")}`;

  /* ── The table: spending and revenue face to face ── */
  const [group, setGroup] = useState<Group>("poste");
  // A line under 0.5 % of its column only brings a « 0 % »: left out.
  const dep = d.topDepenses.filter((x) => x.value / d.depenses >= 0.005);
  const rec = d.recettesBreakdown.filter((x) => x.value / d.recettes >= 0.005);
  const flowTotal = d.flowSplit.reduce((s, f) => s + f.value, 0);
  const natureRows = FLOW_GROUPS
    .map((g) => ({ ...g, value: d.flowSplit.filter((f) => g.flows.includes(f.key)).reduce((s, f) => s + f.value, 0) }))
    .filter((g) => g.value > 0 && flowTotal > 0 && g.value / flowTotal >= 0.01)
    .sort((a, b) => b.value - a.value);
  const natureRest = flowTotal - natureRows.reduce((s, g) => s + g.value, 0);
  const hasNature = natureRows.length > 1;
  const pickGroup = (g: Group) => {
    if (g === group) return;
    track("filter_change", { page: "budget", field: "scene_group", value: g });
    setGroup(g);
  };
  const sparkYears = d.yearsSummary.filter((y) => y.year <= d.year).map((y) => y.year);
  const sparkSpan = sparkYears.length > 1 ? `${sparkYears[0]}–${sparkYears[sparkYears.length - 1]}` : String(d.year);
  /** The line's own years, tiny: grey executed, hatched voted, blue the year shown. */
  const Spark = ({ raw }: { raw: string }) => {
    const pts = (d.series[raw] ?? []).filter((p) => p.year <= d.year);
    if (pts.length < 2) return <span />;
    const m = Math.max(...pts.map((p) => p.value), 1);
    return (
      <span className="fx-bud-spark" aria-hidden="true" title={pts.map((p) => `${p.year} : ${eurTxt(p.value)}`).join(" · ")}>
        {pts.map((p) => (
          <i key={p.year} className={`${p.year === d.year ? "now" : ""} ${p.type === "vote" ? "vote" : ""}`.trim()} style={{ height: Math.max(2, Math.round((p.value / m) * 18)) }} />
        ))}
      </span>
    );
  };
  type RowProps = { raw: string; value: number; total: number; max: number; href: string; missions?: { key: string; value: number }[]; swatch?: string; sep?: boolean; noSpark?: boolean; text?: string };
  const Row = ({ raw, value, total: of, max, href, missions = [], swatch, sep, noSpark, text }: RowProps) => {
    const peek = missions.length ? fill(t("fx.bud.v3.peek"), { list: missions.map((m) => `${missionLabel(m.key, locale)} ${eurTxt(m.value)}`).join(" · ") }) : undefined;
    return (
      <Link href={href} scroll={false} className={`fx-bud-row${sep ? " sep" : ""}`} data-peek={peek}>
        <span className="n">
          {swatch ? <i className="sw" style={{ background: swatch }} aria-hidden="true" /> : null}
          {text ?? label(raw)}
          <i className="bar" style={{ width: `${Math.max(2, Math.round((value / Math.max(max, 1)) * 100))}%`, ...(swatch ? { background: swatch } : {}) }} aria-hidden="true" />
        </span>
        <span className="sp">{noSpark ? null : <Spark raw={raw} />}</span>
        <Amt n={value} />
        <span className="p tnum">{Math.round((value / of) * 100)} %</span>
        <span className="c" aria-hidden="true">›</span>
      </Link>
    );
  };
  // Borrowing sits apart at the bottom of the revenue; the column head says the
  // revenue without it, next to the total.
  const emprunt = rec.find((x) => /emprunt|borrow/i.test(x.label));
  const recRows = rec.filter((x) => x !== emprunt);
  const recNet = d.recettes - (emprunt?.value ?? 0);
  const depMax = Math.max(...dep.map((x) => x.value), 1);
  const natureMax = Math.max(...natureRows.map((g) => g.value), 1);
  const recMax = Math.max(...rec.map((x) => x.value), 1);

  /* ── The heaviest lines of the year, inside the postes above: the mission
     (« RSA », « Aide sociale à l'enfance ») reads better than the M57 nature the
     line carries (« Aides aux personnes »), so the mission is the label and the
     nature the grey line, with the poste. ── */
  const natureName = (name: string) => {
    // « Action Sociale: Subventions d'intervention », « RSA: Aides aux personnes » :
    // the part before the colon is the poste or the mission, already said elsewhere.
    const i = name.lastIndexOf(": ");
    const raw = i > 0 && i + 2 < name.length ? name.slice(i + 2) : name;
    return capFirst(trLabel(raw.replace(/\bhéberg\.(?=[\s,]|$)/i, "hébergement"), locale));
  };
  const lines = foldRest(
    dep
      .flatMap((x) => (x.subPostes ?? []).map((s) => ({ key: `${x.label}|${s.name}`, name: s.name, value: s.value, poste: x.label, fonction: s.fonction })))
      .filter((l) => l.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 8),
    LINES_CAP,
  );
  const LineRow = (l: { key: string; name: string; value: number; poste: string; fonction?: string }) => {
    // A residual mission (« Autres transports ») says nothing: the nature then
    // carries the line (« Contributions obligatoires ») and the poste the grey line.
    const mission = l.fonction ? missionLabel(l.fonction, locale) : "";
    const residual = !mission || /^(autres?|other)\b/i.test(mission);
    return (
      <V3Row
        key={l.key}
        href={`${budgetBase}/poste/${slugifyLabel(l.poste)}?year=${d.year}`}
        label={residual ? natureName(l.name) : mission}
        subText={[label(l.poste), residual ? null : natureName(l.name)].filter(Boolean).join(" · ")}
        amount={<Amt n={l.value} />}
      />
    );
  };

  return (
    <div className="theme-fusion">
      <Navbar />
      <main id="main-content" tabIndex={-1}>
        <div className="fx-sec fx-v3">
          <div className="fx-sec-kicker fx-page-kicker fx-page-kicker--links"><Link href={cityBase}>{cityName}</Link> › {t("fx.sec.bud.kicker")}</div>
          <div className="fx-sec-grid" data-layout="budget">
            <div className="fx-sec-a-hero">
              <SectionHero
                title={t("fx.sec.bud.title")}
                value={total.value}
                unit={total.unit}
                captionBefore={t(isVoted ? "fx.sec.bud.cap_before_vote" : "fx.sec.bud.cap_before")}
                captionAfter={t(isVoted ? "fx.sec.bud.cap_after_vote" : "fx.sec.bud.cap_after_exec")}
                years={years}
                year={d.year}
                yearLabel={yearLabel}
                basePath={budgetBase}
                meta={fill(t(isVoted ? "fx.sec.bud.meta_vote" : "fx.sec.bud.meta"), { hab: population > 0 ? fmtInt(Math.round(d.depenses / population)) : "—", rec: eurTxt(d.recettes) })}
                move={move}
                shareTitle={shareTitle}
              />
            </div>

            <div className="fx-sec-a-rail">
              {series.length >= RAIL_MIN ? (
                <div className="fx-sec-years" data-section="years">
                  <div className="fx-page-kicker">{t("fx.sec.years")}</div>
                  <AnneesRail rows={series} current={d.year} provisional={provisional} />
                </div>
              ) : null}
            </div>

            <div className="fx-sec-a-table">
              <V3Section id="scene" title={fill(t("fx.sec.bud.h.table"), { year: d.year })} sub={fill(t("fx.sec.bud.table_sub"), { span: sparkSpan })}>
                <div id="budget-scene" className="fx-bud-cols">
                  <div className="fx-bud-col">
                    {/* The switch lives in the column head so the first rows of both columns start on the same line. */}
                    <h3>
                      <span>{t("fx.bud.v3.col_dep")}</span>
                      {hasNature ? (
                        <span className="fx-sec-switch" role="group" aria-label={t("fx.sec.bud.g.aria")}>
                          {(["poste", "nature"] as Group[]).map((g) => (
                            <button key={g} type="button" aria-pressed={group === g} onClick={() => pickGroup(g)}>{t(`fx.sec.bud.g.${g}`)}</button>
                          ))}
                        </span>
                      ) : null}
                      <span className="tnum">{eurTxt(d.depenses)}</span>
                    </h3>
                    {group === "poste"
                      ? dep.map((x) => <Row key={x.label} raw={x.label} value={x.value} total={d.depenses} max={depMax} missions={x.topMissions} href={`${budgetBase}/poste/${slugifyLabel(x.label)}?year=${d.year}`} />)
                      : (
                        <>
                          {natureRows.map((g) => <Row key={g.key} raw={g.key} text={capFirst(t(`fx.bud.v3.flow.${g.key}`))} value={g.value} total={flowTotal} max={natureMax} noSpark href={`${budgetBase}/nature/${g.key}?year=${d.year}`} />)}
                          {natureRest > flowTotal * 0.005 ? (
                            <div className="fx-bud-row fx-bud-row--static">
                              <span className="n">{capFirst(t("fx.bud.v3.flow.autres"))}</span>
                              <span className="sp" /><Amt n={natureRest} /><span className="p tnum">{Math.round((natureRest / flowTotal) * 100)} %</span><span className="c" />
                            </div>
                          ) : null}
                          <p className="fx-v3-note">{fill(t("fx.bud.v3.forme_note"), { pct: Math.round(d.flowCoveragePct) })}</p>
                        </>
                      )}
                  </div>
                  <div className="fx-bud-col">
                    <h3>
                      <span>{t("fx.bud.v3.col_rec")}</span>
                      <span className="tnum">{eurTxt(d.recettes)}{emprunt ? <small>{fill(t("fx.sec.bud.rec_net"), { net: eurTxt(recNet) })}</small> : null}</span>
                    </h3>
                    {recRows.map((x) => <Row key={x.label} raw={x.label} value={x.value} total={d.recettes} max={recMax} missions={x.topMissions} href={`${budgetBase}/poste/${slugifyLabel(x.label)}?year=${d.year}`} />)}
                    {emprunt ? <Row raw={emprunt.label} value={emprunt.value} total={d.recettes} max={recMax} sep href={`${budgetBase}/poste/${slugifyLabel(emprunt.label)}?year=${d.year}`} /> : null}
                  </div>
                </div>
                <ShareButton label={t("fx.sec.share_chart")} done={t("fx.sec.shared")} title={shareTitle} object={`scene_${group}`} anchor="budget-scene" />
              </V3Section>
            </div>

            <div className="fx-sec-a-rows">
              {lines.shown.length > 0 ? (
                <V3Section id="lines" title={fill(t("fx.sec.bud.h.lines"), { year: d.year })} sub={t("fx.sec.bud.lines_sub")}>
                  {lines.shown.map(LineRow)}
                  {lines.rest.length > 0 && <V3Fold id="more-lines" text label={t("fx.v3.voir_plus")}>{lines.rest.map(LineRow)}</V3Fold>}
                </V3Section>
              ) : null}
            </div>

            <div className="fx-sec-a-related">
              <V3Section id="related" title={t("fx.sec.see_also")}>
                {/* Doors are named like the sections in the menu; the year and the number sit in the grey line and at the right. */}
                {doors?.marches ? (
                  <Door href={`${cityBase}/marches?year=${doors.marches.year}`} hard title={t("fx.sec.bud.r.marches")} sub={fill(t("fx.sec.bud.r.marches_sub"), { year: doors.marches.year })} value={fmtCompactEur(doors.marches.total).value} unit={fmtCompactEur(doors.marches.total).unit} />
                ) : (
                  <Door href={`${cityBase}/marches`} hard title={t("fx.sec.bud.r.marches")} sub={t("fx.sec.bud.r.marches_sub_noyear")} />
                )}
                {doors?.subventions ? (
                  <Door href={`${cityBase}/subventions?year=${doors.subventions.year}`} hard title={t("fx.sec.bud.r.subventions")} sub={fill(t("fx.sec.bud.r.subventions_sub"), { n: fmtInt(doors.subventions.count), year: doors.subventions.year })} value={fmtCompactEur(doors.subventions.total).value} unit={fmtCompactEur(doors.subventions.total).unit} />
                ) : (
                  <Door href={`${cityBase}/subventions`} hard title={t("fx.sec.bud.r.subventions")} sub={t("fx.sec.bud.r.subventions_sub_noyear")} />
                )}
                <Door href={`${cityBase}/dette`} hard title={t("fx.sec.bud.r.dette")} sub={t("fx.sec.bud.r.dette_sub")} />
                {posts.map((p) => (
                  <V3Row key={p.slug} href={`/analyses/${p.slug}`} label={p.title} subText={t("fx.sec.bud.r.read")} />
                ))}
              </V3Section>
            </div>

            <div className="fx-sec-a-understand">
              <V3Section id="understand" title={t("fx.sec.understand")}>
                <V3Fold id="vote" label={t("fx.sec.bud.u.vote")}><p className="fx-v3-sentence">{t("fx.sec.bud.u.vote_body")}</p></V3Fold>
                <V3Fold id="mesure" label={t("fx.sec.bud.u.mesure")}><p className="fx-v3-sentence">{t("fx.sec.bud.u.mesure_body")}</p></V3Fold>
                <V3Fold id="sources" label={t("fx.sec.bud.u.source")}>
                  <p className="fx-v3-sentence">{t("fx.sec.bud.u.source_body")}</p>
                  <p className="fx-v3-sentence">
                    <a href="https://opendata.paris.fr/explore/dataset/comptes-administratifs-budgets-principaux-a-partir-de-2019-m57-ville-departement/" target="_blank" rel="noopener noreferrer">opendata.paris.fr ↗</a>
                    {" · "}
                    <a href={`/api/budget/${d.year}/csv`} download={`budget-${citySlug}-${d.year}.csv`}>CSV {d.year} ↗</a>
                    {" · "}
                    <a href={`/data/budget_sankey_${d.year}.json`} target="_blank" rel="noopener noreferrer">JSON {d.year} ↗</a>
                    {" · "}
                    <Link href="/methode?tool=budget#outils">{t("fx.s.methode_complete")}</Link>
                  </p>
                </V3Fold>
              </V3Section>
            </div>

            <div className="fx-sec-a-next">
              <NextDoor
                href={`${cityBase}/investissements`}
                kicker={t("fx.sec.next")}
                title={t("fx.sec.bud.next")}
                sub={doors?.invest ? fill(t("fx.sec.bud.next_sub_n"), { year: doors.invest.year }) : t("fx.sec.bud.next_sub")}
                value={doors?.invest ? fmtCompactEur(doors.invest.total).value : undefined}
                unit={doors?.invest ? fmtCompactEur(doors.invest.total).unit : undefined}
              />
            </div>

            <div className="fx-sec-a-foot">
              <V3Foot>{t("fx.sec.bud.foot")}</V3Foot>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
