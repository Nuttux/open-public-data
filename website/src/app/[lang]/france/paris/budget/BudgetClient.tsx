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
import Bars, { type BarRow } from "@/components/fiche/Bars";
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

/** The two cuts of the year's spending. One chart, one switch. Revenue is not
 *  a cut of the same euros: it has its own block, with its own total. */
type Group = "poste" | "nature";

const CITY_NAMES: Record<string, string> = { paris: "Paris", marseille: "Marseille" };
const SCENE_CAP = 6;
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
 * La section « Budget » sur la grammaire des fiches (2026-09-15), la même que
 * Contrats publics : la réponse (un chiffre, sa phrase avec l'année en menu,
 * « voté » dit dans le menu et hachuré sur le rail, la ligne grise, la
 * tendance en ocre, « Partager », le rail des années sous le chiffre), UNE
 * scène qui fait la somme du chiffre avec un commutateur — par poste, par
 * nature — dont chaque barre ouvre une fiche ; puis « D'où vient l'argent »,
 * les recettes toujours visibles avec leur propre total et l'emprunt séparé
 * d'un trait (Daniel, 2026-09-15 : « la plupart des gens ne lisent pas
 * 11,10 de recettes contre 11,02 de dépenses comme un excédent comptable »),
 * les plus grosses lignes, « Comprendre » en replis, « Voir aussi » en portes
 * chiffrées, la section suivante. Sur ordinateur, des bandes : chaque rangée
 * ouvre sur deux titres à la même ligne ; sur téléphone, dépenses puis
 * recettes se suivent, chaque titre portant son total.
 * Partagée avec Marseille : sans nature (pas de flux), portes selon ce que la
 * ville publie.
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

  /* ── The scene: the same euros, three cuts ── */
  const [group, setGroup] = useState<Group>("poste");
  const dep = d.topDepenses.filter((x) => x.value / d.depenses >= 0.005);
  const rec = d.recettesBreakdown.filter((x) => x.value / d.recettes >= 0.005);
  const flowTotal = d.flowSplit.reduce((s, f) => s + f.value, 0);
  const natureRows = FLOW_GROUPS
    .map((g) => ({ ...g, value: d.flowSplit.filter((f) => g.flows.includes(f.key)).reduce((s, f) => s + f.value, 0) }))
    .filter((g) => g.value > 0 && flowTotal > 0 && g.value / flowTotal >= 0.01)
    .sort((a, b) => b.value - a.value);
  const natureRest = flowTotal - natureRows.reduce((s, g) => s + g.value, 0);
  const hasNature = natureRows.length > 1;
  const GROUPS: Group[] = hasNature ? ["poste", "nature"] : ["poste"];
  const pct = (v: number, of: number) => (of > 0 ? Math.round((v / of) * 100) : 0);
  const sceneRows: Record<Group, BarRow[]> = {
    poste: dep.map((x) => ({
      key: x.label,
      label: label(x.label),
      value: x.value,
      text: eurTxt(x.value),
      sub: fill(t("fx.sec.bud.pct_dep"), { pct: pct(x.value, d.depenses) }),
      href: `${budgetBase}/poste/${slugifyLabel(x.label)}?year=${d.year}`,
    })),
    nature: natureRows.map((g) => ({
      key: g.key,
      label: capFirst(t(`fx.bud.v3.flow.${g.key}`)),
      value: g.value,
      text: eurTxt(g.value),
      sub: fill(t("fx.sec.bud.pct_dep"), { pct: pct(g.value, flowTotal) }),
      href: `${budgetBase}/nature/${g.key}?year=${d.year}`,
    })),
  };
  const sceneFold: Partial<Record<Group, { id: string; label: string }>> = {
    poste: { id: "more-postes", label: fill(t("fx.sec.bud.postes_more"), { n: fmtInt(dep.length) }) },
  };

  /* ── Where the money comes from: its own block, its own total; borrowing
     set apart under a rule, because it is not income but debt to repay. ── */
  const emprunt = rec.find((x) => /emprunt|borrow/i.test(x.label));
  const recRow = (x: (typeof rec)[number]): BarRow => ({
    key: x.label,
    label: label(x.label),
    value: x.value,
    text: eurTxt(x.value),
    sub: fill(t("fx.sec.bud.pct_rec"), { pct: pct(x.value, d.recettes) }),
    href: `${budgetBase}/poste/${slugifyLabel(x.label)}?year=${d.year}`,
  });
  const recRows = rec.filter((x) => x !== emprunt).map(recRow);
  const empruntRow: BarRow | undefined = emprunt ? { ...recRow(emprunt), sub: t("fx.sec.bud.emprunt_sub"), tone: "soft", separated: true } : undefined;
  const recNet = d.recettes - (emprunt?.value ?? 0);
  const balance = emprunt
    ? fill(t(isVoted ? "fx.sec.bud.rec_balance_vote" : "fx.sec.bud.rec_balance"), { rec: eurTxt(d.recettes), emp: eurTxt(emprunt.value), net: eurTxt(recNet) })
    : fill(t(isVoted ? "fx.sec.bud.rec_only_vote" : "fx.sec.bud.rec_only"), { rec: eurTxt(d.recettes) });
  const sceneFoot: Partial<Record<Group, BarRow>> = {
    nature: natureRest > flowTotal * 0.005 ? { key: "__autres", label: capFirst(t("fx.bud.v3.flow.autres")), value: natureRest, text: eurTxt(natureRest), tone: "soft" } : undefined,
  };
  const pickGroup = (g: Group) => {
    if (g === group) return;
    track("filter_change", { page: "budget", field: "scene_group", value: g });
    setGroup(g);
  };

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
  const LineRow = (l: { key: string; name: string; value: number; poste: string; fonction?: string }) => (
    <V3Row
      key={l.key}
      href={`${budgetBase}/poste/${slugifyLabel(l.poste)}?year=${d.year}`}
      label={l.fonction ? missionLabel(l.fonction, locale) : natureName(l.name)}
      subText={[label(l.poste), l.fonction ? natureName(l.name) : null].filter(Boolean).join(" · ")}
      amount={<Amt n={l.value} />}
    />
  );

  const yearLabel = (y: number) => (votedYears.includes(y) ? `${y} · ${t("fx.sec.bud.voted_short")}` : String(y));

  return (
    <div className="theme-fusion">
      <Navbar />
      <main id="main-content" tabIndex={-1}>
        <div className="fx-sec fx-v3">
          <div className="fx-sec-kicker fx-page-kicker fx-page-kicker--links"><Link href={cityBase}>{cityName}</Link> › {t("fx.sec.bud.kicker")}</div>
          <div className="fx-sec-grid" data-photo="1">
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
              {series.length >= RAIL_MIN ? (
                <div className="fx-sec-years" data-section="years">
                  <div className="fx-page-kicker">{t("fx.sec.years")}</div>
                  <AnneesRail rows={series} current={d.year} provisional={provisional} />
                </div>
              ) : null}
            </div>

            <div className="fx-sec-a-scene">
              <V3Section id="scene" title={fill(t("fx.sec.bud.h.scene"), { year: d.year })} sub={fill(t("fx.sec.bud.scene_sub"), { total: `${total.value} ${total.unit}` })}>
                {GROUPS.length > 1 ? (
                  <div className="fx-sec-switch" role="group" aria-label={t("fx.sec.bud.g.aria")}>
                    {GROUPS.map((g) => (
                      <button key={g} type="button" aria-pressed={group === g} onClick={() => pickGroup(g)}>{t(`fx.sec.bud.g.${g}`)}</button>
                    ))}
                  </div>
                ) : null}
                <div id="budget-scene" className="fx-sec-scene-body">
                  <Bars key={group} rows={sceneRows[group]} cap={sceneFold[group] ? SCENE_CAP : undefined} foldId={sceneFold[group]?.id} foldLabel={sceneFold[group]?.label} footRow={sceneFoot[group]} />
                  {group === "nature" ? <p className="fx-v3-note">{fill(t("fx.bud.v3.forme_note"), { pct: Math.round(d.flowCoveragePct) })}</p> : null}
                </div>
                <ShareButton label={t("fx.sec.share_chart")} done={t("fx.sec.shared")} title={shareTitle} object={`scene_${group}`} anchor="budget-scene" />
              </V3Section>
            </div>

            <div className="fx-sec-a-second">
              <V3Section id="recettes" title={fill(t("fx.sec.bud.h.recettes"), { year: d.year })} sub={balance}>
                <Bars rows={recRows} cap={SCENE_CAP} foldId="more-recettes" foldLabel={fill(t("fx.sec.bud.recettes_more"), { n: fmtInt(recRows.length) })} footRow={empruntRow} />
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

            <div className="fx-sec-a-related">
              <V3Section id="related" title={t("fx.sec.see_also")}>
                {doors?.marches ? (
                  <Door href={`${cityBase}/marches?year=${doors.marches.year}`} hard title={fill(t("fx.related.marches_section"), { year: doors.marches.year })} sub={t("fx.sec.bud.r.marches_sub")} value={fmtCompactEur(doors.marches.total).value} unit={fmtCompactEur(doors.marches.total).unit} />
                ) : (
                  <Door href={`${cityBase}/marches`} hard title={t("fx.sec.bud.r.marches")} sub={t("fx.sec.bud.r.marches_sub")} />
                )}
                {doors?.subventions ? (
                  <Door href={`${cityBase}/subventions?year=${doors.subventions.year}`} hard title={fill(t("fx.sec.bud.r.subventions"), { year: doors.subventions.year })} sub={fill(t("fx.sec.bud.r.subventions_sub"), { n: fmtInt(doors.subventions.count) })} value={fmtCompactEur(doors.subventions.total).value} unit={fmtCompactEur(doors.subventions.total).unit} />
                ) : (
                  <Door href={`${cityBase}/subventions`} hard title={t("fx.sec.bud.r.subventions_noyear")} sub={t("fx.sec.bud.r.subventions_sub_noyear")} />
                )}
                <Door href={`${cityBase}/dette`} hard title={t("fx.sec.bud.r.dette")} sub={t("fx.sec.bud.r.dette_sub")} />
                {posts.map((p) => (
                  <V3Row key={p.slug} href={`/analyses/${p.slug}`} label={p.title} subText={t("fx.sec.bud.r.read")} />
                ))}
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
