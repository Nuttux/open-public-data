"use client";
import { useState } from "react";
import Link from "@/components/LocalizedLink";
import { usePathname } from "@/lib/navigation";
import { cityPopulation, citySlugFromPathname, crcDebtYearsFor } from "@/lib/methodology";
import { cityDataUrl } from "@/lib/city-paths";
import Navbar from "@/components/fusion/Navbar";
import Footer from "@/components/fusion/Footer";
import AnneesRail, { RAIL_MIN } from "@/components/fusion/AnneesRail";
import SectionHero from "@/components/fiche/SectionHero";
import ShareButton from "@/components/fiche/ShareButton";
import Bars, { type BarRow } from "@/components/fiche/Bars";
import { Door, NextDoor } from "@/components/fiche/Doors";
import { V3Fold, V3Foot, V3Row, V3Section } from "@/components/fiche/v3";
import { useFmt, useFmtEur } from "@/lib/use-fmt";
import { fill, sufOrdinal } from "@/lib/fmt";
import { useLocale, useT } from "@/lib/localeContext";
import { useTrack } from "@/lib/analyticsContext";
import { trLabel } from "@/lib/label-translate";
import { slugifyBailleur, slugifyLabel } from "@/lib/projet-utils";
import { displayOrgName } from "@/lib/fournisseur-display";
import type { BlogPostMeta } from "@/lib/blog";
import type { HorsBilanData, PatrimoineData, PatrimoineStructure } from "@/lib/fusion-data";

type GarGroup = "benef" | "arr";
const CITY_NAMES: Record<string, string> = { paris: "Paris", marseille: "Marseille" };
// Five borrowers and « the others » face the four asset lines: the band ends
// without a hole under the shorter block.
const BENEF_CAP = 5;
const ARR_CAP = 5;
/** The instruments with a plain name and a « who lends » line. */
const INSTRUMENT_KEYS = new Set(["obligataire", "bancaire", "divers"]);
/** Acronyms the source writes in capitals and that stay so. */
const KEEP_CAPS = new Set(["RIVP", "OPH", "SEM", "ICF", "CDC", "I3F", "3F", "RATP", "SNCF", "EPIC", "ESH", "HLM", "SA", "SPLA", "CASVP", "AP-HP", "APHP"]);
/** « PARIS Habitat OPH (EPIC) » → « Paris Habitat OPH », « Trésorerie (Actif) » → « Trésorerie ». */
function cleanName(s: string): string {
  const noParen = s.replace(/\s*\([^)]*\)\s*$/g, "").trim();
  return noParen.split(/(\s+|-)/).map((w) => (/^[A-ZÀ-Ý]{4,}$/.test(w) && !KEEP_CAPS.has(w) ? w.charAt(0) + w.slice(1).toLowerCase() : w)).join("");
}

/**
 * La section « Dette » sur la grammaire des fiches (2026-09-15) : le chiffre
 * (la dette financière au bilan, banques et obligations) avec la dette par
 * habitant et le mouvement, le rail de la dette financière — la courbe suit
 * le chiffre, plus la dette totale — ; UNE scène qui fait la somme du
 * chiffre : comment la Ville emprunte, par instrument ; puis les emprunts
 * qu'elle garantit (par emprunteur ou par arrondissement) face à ce que la
 * dette coûte dans l'année (intérêts et capital remboursé, lus au budget de la
 * même année). L'actif n'est plus mis en regard de la dette : on ne rembourse
 * pas en vendant des écoles (Daniel, 2026-09-15) ; il est dans « Comprendre »
 * (garantir n'est pas devoir, les deux lectures de la capacité de
 * désendettement côte à côte et sourcées, ce qu'elle possède, la règle d'or,
 * les sources) face
 * à « Voir aussi » ; la section suivante. Les villes sans bilan détaillé
 * (Marseille : l'encours OFGL) gardent le chiffre, le rail et « Comprendre ».
 */
export default function DetteClient({ d, structure, horsBilan, posts, cost, costSeries = [], doors }: {
  d: PatrimoineData;
  structure: PatrimoineStructure | null;
  horsBilan: HorsBilanData | null;
  posts: BlogPostMeta[];
  /** What the debt costs in the page's year, from that year's budget. */
  cost?: { year: number; interets: number; remboursement: number; depenses: number; interetsLabel: string; remboursementLabel: string } | null;
  /** Interest plus capital repaid, year by year, for the cost block's rail. */
  costSeries?: { year: number; amount: number }[];
  /** Numbers for the doors, loaded by the page (absent on cities without them). */
  doors?: {
    budget?: { year: number; total: number; voted: boolean } | null;
    logement?: { total: number } | null;
    next?: { count: number } | null;
  };
}) {
  const t = useT();
  const { locale } = useLocale();
  const track = useTrack();
  const fmt = useFmt();
  const { fmtDec, fmtCompactEur } = fmt;
  // Inter draws the narrow no-break space of « 10 347 » as almost nothing.
  const fmtInt = (n: number) => fmt.fmtInt(n).replace(/ /g, " ");
  const fmtEur = useFmtEur();
  const citySlug = citySlugFromPathname(usePathname());
  const cityName = CITY_NAMES[citySlug] ?? citySlug.charAt(0).toUpperCase() + citySlug.slice(1);
  const cityBase = `/france/${citySlug}`;
  const base = `${cityBase}/dette`;
  const isParis = citySlug === "paris";
  const total = fmtCompactEur(d.detteFinanciere);
  const eurTxt = (n: number) => { const f = fmtEur(n); return `${f.v} ${f.u}`; };
  const arrTxt = (n: number) => `${n}${sufOrdinal(n, locale)}`;
  const nEmp = (n: number) => fill(t(n === 1 ? "fx.sec.dette.n_emprunts_one" : "fx.sec.dette.n_emprunts"), { n: fmtInt(n) });

  // The number, its grey line, and the movement: the financial debt against
  // the year before (the same measure, year after year).
  const perHab = d.detteFinanciere / cityPopulation(citySlug);
  const series = d.yearsSummary.filter((y) => y.detteFinanciere > 0).map((y) => ({ year: y.year, amount: y.detteFinanciere }));
  const prev = series.filter((y) => y.year < d.year).sort((a, b) => b.year - a.year)[0];
  const move = prev
    ? (() => {
        const pct = ((d.detteFinanciere - prev.amount) / prev.amount) * 100;
        if (Math.abs(pct) < 0.5) return fill(t("fx.sec.mp.move_flat"), { year: prev.year });
        return fill(t(pct > 0 ? "fx.sec.mp.move_up" : "fx.sec.mp.move_down"), { pct: fmtDec(Math.abs(pct), 1), year: prev.year });
      })()
    : undefined;
  const shareTitle = fill(t("fx.sec.dette.share_title"), { city: cityName, total: `${total.value} ${total.unit}`, year: d.year });

  // The scene: who the City owes. The instruments sum to the number.
  const instRows: BarRow[] = (structure?.structure_dette.instruments ?? [])
    .slice()
    .sort((a, b) => b.encours - a.encours)
    .map((i) => ({
      key: i.key,
      // A form of borrowing, named with who lends (from the instrument's own
      // description: institutional investors, Caisse des Dépôts and banks,
      // deposits and long-term contracts).
      label: INSTRUMENT_KEYS.has(i.key) ? t(`fx.sec.dette.inst.${i.key}`) : trLabel(i.label, locale),
      value: i.encours,
      text: eurTxt(i.encours),
      // One line: who lends. The rate and the maturities are on the fiche.
      sub: INSTRUMENT_KEYS.has(i.key) ? t(`fx.sec.dette.inst.${i.key}_who`) : (i.taux_moyen_pct > 0 ? fill(t("fx.sec.dette.inst_sub"), { t: fmtDec(i.taux_moyen_pct, 2) }) : undefined),
      href: isParis ? `${base}/instrument/${i.key}?year=${d.year}` : null,
    }));
  const hasScene = instRows.length > 0;

  // The guarantees: by borrower (eight and the others) or by arrondissement.
  const [gar, setGar] = useState<GarGroup>("benef");
  const pickGar = (g: GarGroup) => {
    if (g === gar) return;
    track("filter_change", { page: "dette", field: "garanties_group", value: g });
    setGar(g);
  };
  const hb = horsBilan;
  const benefShown = (hb?.top_beneficiaires ?? []).slice().sort((a, b) => b.capital_restant - a.capital_restant).slice(0, BENEF_CAP);
  const benefRows: BarRow[] = benefShown.map((b) => ({
    key: b.key ?? b.name,
    label: cleanName(displayOrgName(b.name)),
    value: b.capital_restant,
    text: eurTxt(b.capital_restant),
    sub: nEmp(b.count_emprunts),
    href: isParis ? `${base}/bailleur/${encodeURIComponent(slugifyBailleur(b.name))}` : null,
  }));
  const benefRest = hb ? Math.max(0, hb.totals.capital_restant - benefShown.reduce((s, b) => s + b.capital_restant, 0)) : 0;
  const benefRestRow: BarRow | undefined = hb && benefRest > hb.totals.capital_restant * 0.005
    ? { key: "__rest", label: fill(t("fx.sec.dette.rest_benef"), { n: fmtInt(Math.max(0, hb.totals.count_beneficiaires - benefShown.length)) }), value: benefRest, text: eurTxt(benefRest), tone: "soft" }
    : undefined;
  const arrRows: BarRow[] = (hb?.by_arrondissement ?? [])
    .filter((a) => a.capital_restant > 0)
    .slice()
    .sort((a, b) => b.capital_restant - a.capital_restant)
    .map((a) => ({
      key: String(a.arr),
      label: fill(t("fx.sec.dette.arr_label"), { arr: arrTxt(a.arr) }),
      value: a.capital_restant,
      text: eurTxt(a.capital_restant),
      sub: nEmp(a.count_emprunts),
      href: isParis ? `${base}/garanties/arrondissement/${a.arr}` : null,
    }));
  const nonLocRow: BarRow | undefined = hb && hb.non_localised.capital_restant > 0
    ? { key: "__nonloc", label: t("fx.sec.dette.non_localised"), value: hb.non_localised.capital_restant, text: eurTxt(hb.non_localised.capital_restant), sub: nEmp(hb.non_localised.count_emprunts), tone: "soft", separated: true }
    : undefined;

  // What the debt costs in the year: interest and capital repaid, the two
  // budget items of that name, each opening its fiche.
  const costRows: BarRow[] = cost
    ? [
        { key: "interets", label: t("fx.sec.dette.cout.interets"), value: cost.interets, text: eurTxt(cost.interets), href: isParis ? `${cityBase}/budget/poste/${slugifyLabel(cost.interetsLabel)}?year=${cost.year}` : null },
        { key: "remboursement", label: t("fx.sec.dette.cout.remboursement"), value: cost.remboursement, text: eurTxt(cost.remboursement), href: isParis ? `${cityBase}/budget/poste/${slugifyLabel(cost.remboursementLabel)}?year=${cost.year}` : null },
      ].sort((a, b) => b.value - a.value)
    : [];
  const costTotal = cost ? cost.interets + cost.remboursement : 0;
  const sd = structure?.structure_dette;
  // The remaining term and the next large maturity are the same in every year's
  // structure file (a copy of today's): said only on the latest balance sheet.
  const isLatest = d.year === Math.max(...d.availableYears);
  const echeance = isLatest && sd?.prochaine_echeance_lourde && sd.prochaine_echeance_lourde.montant_m_eur > 0 ? sd.prochaine_echeance_lourde : null;
  const maturite = isLatest && sd && sd.maturite_moyenne_ans > 0 ? sd.maturite_moyenne_ans : null;
  // The source writes the month in French: said in the reader's language.
  const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
  const echeanceWhen = echeance
    ? (() => {
        const m = MOIS.indexOf(echeance.mois.toLowerCase());
        return m >= 0 ? new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "fr-FR", { month: "long", year: "numeric" }).format(new Date(echeance.annee, m, 1)) : `${echeance.mois} ${echeance.annee}`;
      })()
    : null;

  // What it owns: in « Comprendre », never set against the debt.
  const hasBilan = d.fondsPropres > 0 && (structure?.masses_actif.length ?? 0) > 0;
  const actifMasses = (structure?.masses_actif ?? []).slice().sort((a, b) => b.value - a.value);

  const crc = isParis ? crcDebtYearsFor(citySlug, d.year) : null;
  const layout = !hasScene ? "dette-lite" : "dette";

  return (
    <div className="theme-fusion">
      <Navbar />
      <main id="main-content" tabIndex={-1}>
        <div className="fx-sec fx-v3">
          <div className="fx-sec-kicker fx-page-kicker fx-page-kicker--links"><Link href={cityBase}>{cityName}</Link> › {t("fx.sec.dette.kicker")}</div>
          <div className="fx-sec-grid" data-layout={layout}>
            <div className="fx-sec-a-hero">
              <SectionHero
                title={t("fx.sec.dette.title")}
                value={total.value}
                unit={total.unit}
                captionBefore={t("fx.sec.dette.cap_before")}
                years={d.availableYears}
                year={d.year}
                basePath={base}
                meta={fill(t("fx.sec.dette.meta"), { perHab: fmtInt(perHab) })}
                move={move}
                shareTitle={shareTitle}
              />
              {series.length >= RAIL_MIN ? (
                <div className="fx-sec-years" data-section="years">
                  <div className="fx-page-kicker">{t("fx.sec.years")}</div>
                  <AnneesRail rows={series} current={d.year} />
                </div>
              ) : null}
            </div>

            {hasScene ? (
              <div className="fx-sec-a-scene">
                <V3Section id="scene" title={fill(t("fx.sec.dette.h.scene"), { year: d.year })} sub={t("fx.sec.dette.scene_sub")}>
                  <div id="instruments">
                    <Bars rows={instRows} />
                  </div>
                  <ShareButton label={t("fx.sec.share_chart")} done={t("fx.sec.shared")} title={shareTitle} object="scene_instrument" anchor="instruments" />
                </V3Section>
              </div>
            ) : null}

            {hb ? (
              <div className="fx-sec-a-rows">
                <V3Section id="garanties" title={t("fx.sec.dette.h.garanties")} sub={fill(t("fx.sec.dette.garanties_sub"), { total: eurTxt(hb.totals.capital_restant), year: hb.year, n: fmtInt(hb.totals.count_emprunts), b: fmtInt(hb.totals.count_beneficiaires) })}>
                  <div className="fx-sec-switch" role="group" aria-label={t("fx.sec.dette.g.aria")}>
                    {(["benef", "arr"] as GarGroup[]).map((g) => (
                      <button key={g} type="button" aria-pressed={gar === g} onClick={() => pickGar(g)}>{t(`fx.sec.dette.g.${g}`)}</button>
                    ))}
                  </div>
                  <div className="fx-sec-scene-body" id="garanties-detail">
                    {gar === "benef" ? (
                      <Bars key="benef" rows={benefRows} footRow={benefRestRow} />
                    ) : (
                      <Bars key="arr" rows={arrRows} cap={ARR_CAP} foldId="more-arr-garanties" foldLabel={fill(t("fx.sec.dette.arr_more"), { n: fmtInt(arrRows.length) })} footRow={nonLocRow} />
                    )}
                  </div>
                  {hb.totals.annuite_totale > 0 ? (
                    <p className="fx-v3-note">{fill(t("fx.sec.dette.garanties_annuite"), { annuite: eurTxt(hb.totals.annuite_totale) })}</p>
                  ) : null}
                </V3Section>
              </div>
            ) : null}

            {cost && hasScene ? (
              <div className="fx-sec-a-second">
                <V3Section id="cout" title={fill(t("fx.sec.dette.h.cout"), { year: cost.year })} sub={fill(t("fx.sec.dette.cout_sub"), { total: eurTxt(costTotal), pct: fmtDec((costTotal / cost.depenses) * 100, 1) })}>
                  <Bars rows={costRows} />
                  {costSeries.filter((y) => y.amount > 0).length >= RAIL_MIN ? (
                    <div className="fx-sec-years fx-sec-years--in">
                      <div className="fx-page-kicker">{t("fx.sec.years")}</div>
                      <AnneesRail rows={costSeries.filter((y) => y.amount > 0)} current={cost.year} />
                    </div>
                  ) : null}
                  {maturite != null || echeance ? (
                    <p className="fx-v3-note">
                      {[
                        maturite != null ? fill(t("fx.sec.dette.cout.maturite_line"), { n: fmtDec(maturite, 0) }) : null,
                        echeance && echeanceWhen ? fill(t("fx.sec.dette.cout.echeance_line"), { amount: eurTxt(echeance.montant_m_eur * 1e6), when: echeanceWhen }) : null,
                      ].filter(Boolean).join(" ")}
                    </p>
                  ) : null}
                </V3Section>
              </div>
            ) : null}

            <div className="fx-sec-a-understand">
              <V3Section id="understand" title={t("fx.sec.understand")}>
                {hb ? (
                  <V3Fold id="garantir" label={t("fx.sec.dette.u.garantir")}><p className="fx-v3-sentence">{t("fx.sec.dette.u.garantir_body")}</p></V3Fold>
                ) : null}
                <V3Fold id="capacite" label={t("fx.sec.dette.u.capacite")}>
                  <p className="fx-v3-sentence">{t("fx.sec.dette.u.capacite_intro")}</p>
                  <p className="fx-v3-sentence">{fill(t(isParis ? "fx.sec.dette.u.capacite_ville" : "fx.sec.dette.u.capacite_ofgl"), { v: fmtDec(d.capaciteDesendettement, 1), year: d.year })}</p>
                  {crc ? (
                    <p className="fx-v3-sentence">
                      {fill(t("fx.sec.dette.u.capacite_crc"), { v: fmtDec(crc.value_crc_ans, 1), date: crc.date_reference.slice(0, 4) })}{" "}
                      {crc.source_url_crc ? <a href={crc.source_url_crc} target="_blank" rel="noopener noreferrer">{t("fx.sec.dette.u.capacite_crc_link")} ↗</a> : null}
                    </p>
                  ) : null}
                </V3Fold>
                {hasBilan ? (
                  <V3Fold id="patrimoine" label={t("fx.sec.dette.u.patrimoine")}>
                    <p className="fx-v3-sentence">{fill(t("fx.sec.dette.u.patrimoine_body"), { year: d.year, actif: eurTxt(d.actif) })}</p>
                    {actifMasses.map((m) => (
                      <V3Row key={m.label} href={isParis ? `${base}/masse/${slugifyLabel(m.label)}?year=${d.year}` : null} label={cleanName(trLabel(m.label, locale))}
                        amount={<span className="fx-v3-amt tnum" style={{ fontSize: 14 }}>{fmtEur(m.value).v}<span className="u">{fmtEur(m.value).u}</span></span>} />
                    ))}
                  </V3Fold>
                ) : null}
                <V3Fold id="regle" label={t("fx.sec.dette.u.regle")}>
                  <p className="fx-v3-sentence">{t("fx.sec.dette.u.regle_intro")}</p>
                  <ul className="fx-sec-list">
                    {[1, 2, 3, 4].map((k) => <li key={k}>{t(`fx.det.s01.r${k}.h`)}</li>)}
                  </ul>
                </V3Fold>
                <V3Fold id="sources" label={t("fx.sec.dette.u.source")}>
                  <p className="fx-v3-sentence">{t(isParis ? "fx.sec.dette.u.source_body" : "fx.sec.dette.u.source_body_city")}</p>
                  <p className="fx-v3-sentence">
                    {isParis ? (
                      <>
                        <a href="https://opendata.paris.fr/explore/dataset/bilan-comptable/" target="_blank" rel="noopener noreferrer">opendata.paris.fr ↗</a>
                        {" · "}
                        <a href="https://opendata.paris.fr/explore/dataset/dette-garantie/" target="_blank" rel="noopener noreferrer">{locale === "en" ? "Guaranteed debt" : "Dette garantie"} ↗</a>
                        {" · "}
                      </>
                    ) : (
                      <>
                        <a href="https://data.ofgl.fr/explore/dataset/ofgl-base-communes-consolidee/" target="_blank" rel="noopener noreferrer">data.ofgl.fr ↗</a>
                        {" · "}
                      </>
                    )}
                    <a href={cityDataUrl(citySlug, `bilan_sankey_${d.year}.json`)} target="_blank" rel="noopener noreferrer">JSON {d.year} ↗</a>
                    {" · "}
                    <Link href="/methode?tool=dette-patrimoine#outils">{t("fx.s.methode_complete")}</Link>
                  </p>
                </V3Fold>
              </V3Section>
            </div>

            <div className="fx-sec-a-related">
              <V3Section id="related" title={t("fx.sec.see_also")}>
                {doors?.budget ? (
                  <Door href={`${cityBase}/budget?year=${doors.budget.year}`} hard title={t("fx.sec.dette.r.budget")} sub={fill(t(doors.budget.voted ? "fx.sec.dette.r.budget_sub_vote" : "fx.sec.dette.r.budget_sub"), { year: doors.budget.year })} value={fmtCompactEur(doors.budget.total).value} unit={fmtCompactEur(doors.budget.total).unit} />
                ) : (
                  <Door href={`${cityBase}/budget`} hard title={t("fx.sec.dette.r.budget")} sub={t("fx.sec.dette.r.budget_sub_noyear")} />
                )}
                <Door href={`${cityBase}/logement`} hard title={t("fx.sec.dette.r.logement")} sub={t(hb ? "fx.sec.dette.r.logement_sub" : "fx.sec.dette.r.logement_sub_city")} value={doors?.logement ? fmtInt(doors.logement.total) : undefined} unit={doors?.logement ? t("fx.sec.dette.r.logement_unit") : undefined} />
                {isParis ? <Door href={`${base}/stress-test`} hard title={t("fx.sec.dette.r.stress")} sub={t("fx.sec.dette.r.stress_sub")} /> : null}
                {posts.map((p) => (
                  <V3Row key={p.slug} href={`/analyses/${p.slug}`} label={p.title} subText={t("fx.sec.dette.r.read")} />
                ))}
              </V3Section>
            </div>

            <div className="fx-sec-a-next">
              <NextDoor
                href={`${cityBase}/lieux`}
                kicker={t("fx.sec.next")}
                title={t("fx.sec.dette.next")}
                sub={t("fx.sec.dette.next_sub")}
                value={doors?.next && doors.next.count > 0 ? fmtInt(doors.next.count) : undefined}
                unit={doors?.next && doors.next.count > 0 ? t("fx.sec.dette.next_unit") : undefined}
              />
            </div>

            <div className="fx-sec-a-foot">
              <V3Foot>{t(isParis ? "fx.sec.dette.foot" : "fx.sec.dette.foot_city")}</V3Foot>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
