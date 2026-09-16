"use client";
import { useState } from "react";
import Link from "@/components/LocalizedLink";
import { usePathname } from "@/lib/navigation";
import { citySlugFromPathname } from "@/lib/methodology";
import Navbar from "@/components/fusion/Navbar";
import Footer from "@/components/fusion/Footer";
import AnneesRail, { RAIL_MIN } from "@/components/fusion/AnneesRail";
import MarchesSearch from "./MarchesSearch";
import SectionHero from "@/components/fiche/SectionHero";
import ShareButton from "@/components/fiche/ShareButton";
import Bars, { type BarRow } from "@/components/fiche/Bars";
import Mosaic from "@/components/fiche/Mosaic";
import { Door, NextDoor } from "@/components/fiche/Doors";
import { V3Fold, V3Foot, V3Row, V3Section, foldRest } from "@/components/fiche/v3";
import DataAlert, { DATA_ALERTS_ON } from "@/components/fusion/DataAlert";
import { useFmt, useFmtEur } from "@/lib/use-fmt";
import { fill } from "@/lib/fmt";
import { useLocale, useT } from "@/lib/localeContext";
import { useTrack } from "@/lib/analyticsContext";
import { cutObjet, rowObjet } from "@/lib/objet-normalizer";
import { displayOrgName } from "@/lib/fournisseur-display";
import { isNamedTitulaire } from "@/lib/marches-shape";
import { offresBucketSlug } from "@/lib/marches-offres";
import { domaineLabel } from "@/lib/marches-domaines";
import type { MarchesPageData } from "@/lib/fusion-data";

type MarchesIndex = { availableYears?: number[] };

/** The three ways the scene cuts the year's contracts. One chart, one switch.
 *  (« nature » is the same cut as the category, coarser: dropped 2026-09-14.
 *  « catégorie » followed on 2026-09-15: the source's nomenclature changes
 *  with the year, the Qipu domain reads the same from 2013 to 2025.) */
type Group = "domaine" | "offres" | "entreprise";
const GROUPS: Group[] = ["domaine", "offres", "entreprise"];

const CITY_NAMES: Record<string, string> = { paris: "Paris", marseille: "Marseille" };
const CONTRATS_CAP = 5;
const SCENE_CAP = 5;

/**
 * La section « Contrats publics » sur la grammaire des fiches (2026-09-14) :
 * la réponse (un chiffre, sa phrase, l'année en menu, « Partager »), UNE scène
 * en euros qui fait la somme du chiffre, avec un commutateur pour la découper
 * par domaine, nombre d'offres ou entreprise (mesuré : filter_change field
 * scene_group) — en barres, ou en mosaïque avec les barres repliées dessous
 * (`variant`, comparaison du 2026-09-14) —, le rail des années sous le chiffre,
 * la photo d'un contrat, des lignes qui mènent aux fiches, « Comprendre » en
 * replis, « Voir aussi », la recherche (le champ seul, les résultats en lignes)
 * et la section suivante.
 * Deux écrans portent tout sur un téléphone ; sur ordinateur, des bandes : chaque
 * rangée de .fx-sec-grid ouvre sur deux titres à la même ligne (2026-09-15).
 */
export default function MarchesPublicsClient({ idx, d, doors, variant = "bars" }: {
  idx: MarchesIndex;
  d: MarchesPageData;
  /** Numbers for the doors, loaded by the page (absent on cities without them). */
  doors?: { invest?: { year: number; total: number } | null; next?: { total: number; year: number } | null };
  /** How the scene is drawn: labeled bars, or the mosaic with the bars folded. */
  variant?: "bars" | "mosaic";
}) {
  const t = useT();
  const { locale } = useLocale();
  const track = useTrack();
  const fmt = useFmt();
  const { fmtDec, fmtCompactEur } = fmt;
  // Inter draws the narrow no-break space of « 1 122 » as almost nothing: a
  // full no-break space keeps the thousands readable in running text.
  const fmtInt = (n: number) => fmt.fmtInt(n).replace(/ /g, " ");
  const fmtEur = useFmtEur();
  const citySlug = citySlugFromPathname(usePathname());
  const cityName = CITY_NAMES[citySlug] ?? citySlug.charAt(0).toUpperCase() + citySlug.slice(1);
  const cityBase = `/france/${citySlug}`;
  const marchesBase = `${cityBase}/marches`;
  // The category and « number of bids » fiches exist for Paris only.
  const hasCutFiches = citySlug === "paris";
  const years = (idx.availableYears ?? []).filter((y) => y <= Math.max(d.year, ...d.availableYears)).slice().sort((a, b) => a - b);
  const total = fmtCompactEur(d.total);
  const eurTxt = (n: number) => { const f = fmtEur(n); return `${f.v} ${f.u}`; };
  const Amt = ({ n }: { n: number }) => { const f = fmtEur(n); return <span className="fx-v3-amt tnum" style={{ fontSize: 14 }}>{f.v}<span className="u">{f.u}</span></span>; };
  const contractsCount = (n: number) => fill(t(n === 1 ? "fx.categorie.contrats_count_one" : "fx.categorie.contrats_count_many"), { n: fmtInt(n) });
  // The scene: the same euros, three cuts. Offers are only published from 2024.
  const [group, setGroup] = useState<Group>("domaine");
  const c = d.concurrence;
  const coveragePct = c.coverageTotal > 0 ? (c.coverageCount / c.coverageTotal) * 100 : 0;
  const hasCompetition = coveragePct >= 20 && c.coverageCount >= 50;
  // Every cut sums to the page's number: what the ten largest companies do not
  // cover (the other 679 and the shared lots), and the contracts whose number
  // of bids is not published, are rows too — soft, without a fiche.
  const top10Sum = d.top10.reduce((a, ti) => a + ti.amount, 0);
  const restCompanies = Math.max(0, d.total - top10Sum);
  const restCompaniesRow: BarRow | undefined = restCompanies > d.total * 0.005
    ? { key: "__rest", label: fill(t("fx.sec.mp.rest_companies"), { n: fmtInt(Math.max(0, d.nbTitulaires - d.top10.length)) }), value: restCompanies, text: eurTxt(restCompanies), tone: "soft" }
    : undefined;
  const bucketsSum = c.buckets.reduce((a, b) => a + b.amount, 0);
  const restOffres = Math.max(0, d.total - bucketsSum);
  const restOffresRow: BarRow | undefined = hasCompetition && restOffres > d.total * 0.005
    ? { key: "__unknown", label: t("fx.sec.mp.rest_offres"), value: restOffres, text: eurTxt(restOffres), tone: "soft" }
    : undefined;
  const sceneRows: Record<Group, BarRow[]> = {
    domaine: d.byDomaine.map((x) => ({
      key: x.slug,
      label: domaineLabel(x.slug, locale),
      value: x.amount,
      text: eurTxt(x.amount),
      sub: contractsCount(x.count),
      // The year rides in the path (domaine/proprete-dechets-2020); the latest complete year needs no suffix.
      href: hasCutFiches && x.count > 0
        ? `${marchesBase}/domaine/${x.slug}${d.year === Math.max(...d.availableYears) ? "" : `-${d.year}`}`
        : null,
    })),
    offres: hasCompetition
      ? c.buckets.map((b) => ({
          key: b.bucket,
          label: t(`fx.mp.s05.bucket.${b.bucket}`),
          value: b.amount,
          text: eurTxt(b.amount),
          sub: contractsCount(b.count),
          // The year rides in the path (offres/1-2024); the latest complete year needs no suffix.
          href: hasCutFiches && b.count > 0
            ? `${marchesBase}/offres/${offresBucketSlug(b.bucket)}${d.year === Math.max(...d.availableYears) ? "" : `-${d.year}`}`
            : null,
        }))
      : [],
    entreprise: d.top10.map((ti) => ({
      key: ti.siret || ti.name,
      label: displayOrgName(ti.name),
      value: ti.amount,
      text: eurTxt(ti.amount),
      sub: contractsCount(ti.nbContrats),
      href: ti.siret ? `${marchesBase}/fournisseur/${encodeURIComponent(ti.siret)}` : null,
    })),
  };
  const sceneFold: Partial<Record<Group, { id: string; label: string }>> = {
    domaine: { id: "more-domaines", label: fill(t("fx.sec.mp.domaines_more"), { n: fmtInt(d.byDomaine.length) }) },
    entreprise: { id: "more-companies", label: t("fx.v3.voir_plus") },
  };
  const pickGroup = (g: Group) => {
    if (g === group) return;
    track("filter_change", { page: "marches-publics", field: "scene_group", value: g, variant });
    setGroup(g);
  };

  const contrats = foldRest(d.topContrats, CONTRATS_CAP);
  // A row: a short title (the clear title when one exists, else the object cut
  // at a clause), then the lot and the holder on the grey line. Lots of one
  // framework share a title in the source: the line says « un des 3 lots ».
  const rowTitleOf = (x: MarchesPageData["topContrats"][number]) => {
    const preferred = locale === "en" && x.objetClairEn ? x.objetClairEn : x.objetClair;
    return preferred ? { title: cutObjet(preferred, 96), detail: null } : rowObjet(x.objet || "");
  };
  const titleCounts = new Map<string, number>();
  for (const x of d.topContrats) { const k = rowTitleOf(x).title; titleCounts.set(k, (titleCounts.get(k) ?? 0) + 1); }
  const ContratRow = (x: MarchesPageData["topContrats"][number]) => {
    const { title, detail } = rowTitleOf(x);
    const named = x.titulaires.filter((n) => isNamedTitulaire(n)).map((n) => displayOrgName(n));
    const who = x.holders > 1
      ? fill(t("fx.sec.mp.shared_lot"), { n: x.holders })
      : x.fournisseur === "MARCHE MULTIATTRIBUTAIRE"
        ? t("fx.sec.mp.multi_holders")
        : named[0] ?? (isNamedTitulaire(x.fournisseur) ? displayOrgName(x.fournisseur) : t("fx.sec.mp.holder_unknown"));
    const lots = titleCounts.get(title) ?? 1;
    const sub = [lots > 1 ? fill(t("fx.sec.mp.one_of_lots"), { n: lots }) : null, detail, who].filter(Boolean).join(" · ");
    return (
      <V3Row key={x.numero || title} href={x.numero ? `${marchesBase}/contrat/${encodeURIComponent(x.numero)}` : null}
        label={title} subText={sub} amount={<Amt n={x.montant} />} />
    );
  };
  // One image: the year's largest contract behind a documented worksite with a
  // real photo (rule-based, never an illustration passed off as real).
  const photo = d.signature.find((s) => s.kind === "chantier" && s.photoKind === "reelle" && s.photoUrl) ?? null;

  // The movement under the number: the year against the one before, in ocre —
  // only when both years come from the same source (2024 → 2025 crosses the
  // Paris-list → DECP break, where a « − 50 % » would be the source, not the City).
  const prevYear = d.prevComparable;
  const move = prevYear
    ? (() => {
        const pct = ((d.total - prevYear.total) / prevYear.total) * 100;
        if (Math.abs(pct) < 0.5) return fill(t("fx.sec.mp.move_flat"), { year: prevYear.year });
        const base = fill(t(pct > 0 ? "fx.sec.mp.move_up" : "fx.sec.mp.move_down"), { pct: fmtDec(Math.abs(pct), 0), year: prevYear.year });
        // The domain that made the jump, when one explains at least a third of it.
        const td = prevYear.topDomaine;
        return td
          ? base + fill(t("fx.sec.mp.move_of_which"), { sign: td.delta > 0 ? "+" : "−", amount: eurTxt(Math.abs(td.delta)), label: domaineLabel(td.slug, locale).toLocaleLowerCase(locale) })
          : base;
      })()
    : undefined;

  const series = d.yearsSummary.filter((y) => y.total > 0).map((y) => ({ year: y.year, amount: y.total }));
  const shareTitle = fill(t("fx.sec.mp.share_title"), { city: cityName, total: `${total.value} ${total.unit}`, year: d.year });

  const sceneFoot: Partial<Record<Group, BarRow | undefined>> = { entreprise: restCompaniesRow, offres: restOffresRow };
  const sceneBars = (
    <Bars key={group} rows={sceneRows[group]} cap={sceneFold[group] ? SCENE_CAP : undefined} foldId={sceneFold[group]?.id} foldLabel={sceneFold[group]?.label} footRow={sceneFoot[group]} />
  );
  const mosaicRows = sceneFoot[group] ? [...sceneRows[group], sceneFoot[group]!] : sceneRows[group];
  const otherLabel = (merged: number) =>
    group === "entreprise"
      ? fill(t("fx.sec.mp.rest_companies"), { n: fmtInt(Math.max(0, d.nbTitulaires - d.top10.length + merged)) })
      : t("fx.sec.mp.other");

  return (
    <div className="theme-fusion">
      <Navbar />
      <main id="main-content" tabIndex={-1}>
        <div className="fx-sec fx-v3" data-variant={variant}>
          {/* Above the grid, full width: the two columns then start on the same line. */}
          <div className="fx-sec-kicker fx-page-kicker fx-page-kicker--links"><Link href={cityBase}>{cityName}</Link> › {t("fx.sec.mp.kicker")}</div>
          <div className="fx-sec-grid" data-photo={photo ? "1" : "0"}>
            <div className="fx-sec-a-hero">
              <SectionHero
                title={t("fx.sec.mp.title")}
                value={total.value}
                unit={total.unit}
                captionBefore={t("fx.sec.mp.cap_before")}
                captionAfter={t("fx.sec.mp.cap_after")}
                years={years}
                year={d.year}
                basePath={marchesBase}
                meta={fill(t("fx.sec.mp.meta"), { n: fmtInt(d.nb), t: fmtInt(d.nbTitulaires) })}
                move={move}
                shareTitle={shareTitle}
              />
              {/* The number's own history sits under it, as on the fiches: a kicker, not a section title. */}
              {series.length >= RAIL_MIN ? (
                <div className="fx-sec-years" data-section="years">
                  <div className="fx-page-kicker">{t("fx.sec.years")}</div>
                  <AnneesRail rows={series} current={d.year} />
                </div>
              ) : null}
            </div>

            <div className="fx-sec-a-scene">
              <V3Section id="scene" title={fill(t("fx.sec.mp.h.categories"), { year: d.year })} sub={t("fx.sec.mp.h.scene_sub")}>
                <div className="fx-sec-switch" role="group" aria-label={t("fx.sec.mp.g.aria")}>
                  {GROUPS.map((g) => (
                    <button key={g} type="button" aria-pressed={group === g} onClick={() => pickGroup(g)}>{t(`fx.sec.mp.g.${g}`)}</button>
                  ))}
                </div>
                <div id="achats">
                  {group === "offres" && hasCompetition ? (
                    <p className="fx-sec-sentence" id="concurrence">
                      <b>{fill(t("fx.sec.mp.conc.bold"), { single: fmtInt(c.monoCount), known: fmtInt(c.coverageCount) })}</b>
                      {t("fx.sec.mp.conc.rest")}
                    </p>
                  ) : null}
                  {group === "offres" && !hasCompetition ? (
                    <p className="fx-sec-sentence">{t("fx.sec.mp.conc.na")}</p>
                  ) : variant === "mosaic" ? (
                    <>
                      <Mosaic key={group} rows={mosaicRows} otherLabel={otherLabel} format={eurTxt} />
                      <V3Fold id="amounts" text label={t("fx.sec.mp.amounts")}>{sceneBars}</V3Fold>
                    </>
                  ) : (
                    sceneBars
                  )}
                  {group === "offres" && hasCompetition && coveragePct < 95 ? (
                    <p className="fx-v3-note">{fill(t("fx.mp.s05.note"), { n: fmtInt(c.coverageCount), total: fmtInt(c.coverageTotal), pct: fmtDec(coveragePct, 0) })}</p>
                  ) : null}
                  {/* The counting rule under the chart; the sub-line above invites to open a row, like every section page. */}
                  <p className="fx-v3-note">{t("fx.sec.mp.scene_rule")}</p>
                </div>
                <ShareButton label={t("fx.sec.share_chart")} done={t("fx.sec.shared")} title={shareTitle} object={`scene_${group}`} anchor="achats" />
              </V3Section>
            </div>

            {/* Right after the first screen, as a band: for whoever came with a name in
                mind. A tool, not a chapter: its title is a kicker, not a section title. */}
            <div className="fx-sec-a-search">
              <section className="fx-v3-section fx-sec-searchblk" data-section="search">
                <div className="fx-page-kicker">{t("fx.sec.mp.h.search")}</div>
                <MarchesSearch fiche citySlug={citySlug} categories={d.byCategory.map((x) => x.category)} natures={[...new Map(d.byNature.map((n) => [n.nature.toLowerCase(), n.nature])).values()]} year={d.year} />
              </section>
            </div>

            <div className="fx-sec-a-photo">
              {photo ? (
                // A titled block like the others, so it faces « Les plus gros contrats »
                // on the same line. Framed from the contract's side: the image and the
                // title open the contract's fiche; the worksite has its own door.
                <V3Section id="photo" title={fill(t("fx.sec.mp.photo_kicker"), { year: d.year })}>
                <figure className="fx-sec-photo">
                  <Link href={`${marchesBase}/contrat/${encodeURIComponent(photo.numero)}`} scroll={false} className="fx-sec-photo-img" aria-hidden="true" tabIndex={-1}>
                    <img src={photo.photoUrl!} alt="" loading="lazy" />
                  </Link>
                  <figcaption className="fx-sec-photo-cap">
                    <Link href={`${marchesBase}/contrat/${encodeURIComponent(photo.numero)}`} scroll={false} className="t">{(locale === "en" && photo.labelEn) || photo.label} ›</Link>
                    {/* The project name without its programme label (« Place Saint-Augustin - Embellir votre quartier »). */}
                    <span className="s">
                      {[((locale === "en" && photo.projetNomEn) || photo.projetNom || "").split(/\s+-\s+/)[0].replace(/^(?:EM|EE|EP|EPM|GS|CR|CM)\s?\d+[,\s]+/i, "").trim() || null, eurTxt(photo.montant)].filter(Boolean).join(" · ")}
                      {photo.projetId ? <> · <Link href={`${cityBase}/investissements/projet/${encodeURIComponent(photo.projetId)}`} scroll={false}>{t("fx.sec.mp.photo_project")} ›</Link></> : null}
                    </span>
                    {photo.photoCredit ? <span className="c">{fill(t("fx.sec.mp.photo_credit"), { credit: photo.photoCredit })}</span> : null}
                  </figcaption>
                </figure>
                </V3Section>
              ) : null}
            </div>

            <div className="fx-sec-a-rows">
              <V3Section id="contracts" title={fill(t("fx.sec.mp.h.contracts"), { year: d.year })}>
                {contrats.shown.map(ContratRow)}
                {contrats.rest.length > 0 && <V3Fold id="more-contracts" text label={t("fx.v3.voir_plus")}>{contrats.rest.map(ContratRow)}</V3Fold>}
              </V3Section>
            </div>

            <div className="fx-sec-a-understand">
              <V3Section id="understand" title={t("fx.sec.understand")}>
                <V3Fold id="plafond" label={t("fx.sec.mp.u.plafond")}><p className="fx-v3-sentence">{t("fx.sec.mp.u.plafond_body")}</p></V3Fold>
                <V3Fold id="single-bid" label={t("fx.sec.mp.u.single")}><p className="fx-v3-sentence">{t("fx.sec.mp.u.single_body")}</p></V3Fold>
                <V3Fold id="sources" label={t("fx.sec.mp.u.source")}>
                  <p className="fx-v3-sentence">{t("fx.sec.mp.u.source_body")}</p>
                  {d.dedup.dropped > 0 ? (
                    <p className="fx-v3-sentence">{fill(t("fx.sec.mp.u.source_dedup"), { year: d.year, n: fmtInt(d.dedup.dropped), amount: eurTxt(d.dedup.amount) })}</p>
                  ) : null}
                  <p className="fx-v3-sentence">
                    <a href="https://opendata.paris.fr/explore/dataset/liste-des-marches-de-la-collectivite-parisienne/" target="_blank" rel="noopener noreferrer">opendata.paris.fr ↗</a>
                    {" · "}
                    <a href={`/data/marches-publics/marches_${d.year}.json`} target="_blank" rel="noopener noreferrer">JSON {d.year} ↗</a>
                    {" · "}
                    <Link href="/methode?tool=marches-publics#outils">{t("fx.s.methode_complete")}</Link>
                  </p>
                </V3Fold>
              </V3Section>
            </div>

            <div className="fx-sec-a-related">
              <V3Section id="related" title={t("fx.sec.see_also")}>
                {doors?.invest ? (
                  <Door href={`${cityBase}/investissements`} hard title={t("fx.sec.mp.r.invest")} sub={fill(t("fx.sec.mp.r.invest_sub"), { year: doors.invest.year })} value={fmtCompactEur(doors.invest.total).value} unit={fmtCompactEur(doors.invest.total).unit} />
                ) : (
                  <Door href={`${cityBase}/investissements`} hard title={t("fx.sec.mp.r.invest")} sub={t("fx.sec.mp.r.invest_sub_noyear")} />
                )}
                <Door href={`${marchesBase}/contrats`} hard title={t("fx.sec.mp.r.all")} sub={t("fx.sec.mp.r.all_sub")} />
                <Door href={`${cityBase}/budget`} hard title={t("fx.sec.mp.r.budget")} sub={t("fx.sec.mp.r.budget_sub")} />
              </V3Section>
            </div>

            <div className="fx-sec-a-next">
              <NextDoor
                href={`${cityBase}/logement`}
                kicker={t("fx.sec.next")}
                title={t("fx.sec.mp.next")}
                sub={doors?.next ? fill(t("fx.sec.mp.next_sub_n"), { year: doors.next.year }) : t("fx.sec.mp.next_sub")}
                value={doors?.next ? fmtInt(doors.next.total) : undefined}
                unit={doors?.next ? t("fx.sec.mp.next_unit") : undefined}
              />
            </div>

            <div className="fx-sec-a-foot">
              {DATA_ALERTS_ON && citySlug === "paris" ? <DataAlert section="marches" /> : null}
              <V3Foot>{t("fx.sec.mp.foot")}</V3Foot>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
