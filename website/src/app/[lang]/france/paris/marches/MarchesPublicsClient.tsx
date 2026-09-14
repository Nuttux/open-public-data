"use client";
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
import { Door, NextDoor } from "@/components/fiche/Doors";
import { V3Fold, V3Foot, V3Row, V3Section, foldRest } from "@/components/fiche/v3";
import { useFmt, useFmtEur } from "@/lib/use-fmt";
import { fill } from "@/lib/fmt";
import { useLocale, useT } from "@/lib/localeContext";
import { cutObjet, shortObjet } from "@/lib/objet-normalizer";
import { displayOrgName } from "@/lib/fournisseur-display";
import { isNamedTitulaire } from "@/lib/marches-shape";
import { slugifyLabel } from "@/lib/projet-utils";
import { trLabel } from "@/lib/label-translate";
import type { MarchesPageData } from "@/lib/fusion-data";

type MarchesIndex = { availableYears?: number[] };

const CITY_NAMES: Record<string, string> = { paris: "Paris", marseille: "Marseille" };
const CONTRATS_CAP = 5;
const CATEGORIES_CAP = 5;

/**
 * La section « Contrats publics » sur la grammaire des fiches (2026-09-14) :
 * la réponse (un chiffre, sa phrase, l'année en menu, « Partager »), UNE scène
 * qui surprend (la concurrence : un contrat sur trois signé sur une seule
 * offre), des lignes qui mènent aux fiches, les autres découpes en barres,
 * le rail des années, la recherche plus bas, « Comprendre » en replis, « Voir
 * aussi » et la section suivante. Deux écrans portent tout sur un téléphone ;
 * sur ordinateur, la scène à gauche et les lignes à droite (.fx-sec-grid).
 *
 * Chaque bloc porte un data-section stable pour section_view / link_click ;
 * les replis un data-fold ; le menu d'année et les partages leurs événements.
 */
export default function MarchesPublicsClient({ idx, d, doors }: {
  idx: MarchesIndex;
  d: MarchesPageData;
  /** Numbers for the doors, loaded by the page (absent on cities without them). */
  doors?: { invest?: { year: number; total: number } | null };
}) {
  const t = useT();
  const { locale } = useLocale();
  const { fmtInt, fmtDec, fmtCompactEur } = useFmt();
  const fmtEur = useFmtEur();
  const citySlug = citySlugFromPathname(usePathname());
  const cityName = CITY_NAMES[citySlug] ?? citySlug.charAt(0).toUpperCase() + citySlug.slice(1);
  const cityBase = `/france/${citySlug}`;
  const marchesBase = `${cityBase}/marches`;
  const hasCategorieFiche = citySlug === "paris";
  const years = (idx.availableYears ?? []).filter((y) => y <= Math.max(d.year, ...d.availableYears)).slice().sort((a, b) => a - b);
  const total = fmtCompactEur(d.total);
  const eurTxt = (n: number) => { const f = fmtEur(n); return `${f.v} ${f.u}`; };
  const Amt = ({ n }: { n: number }) => { const f = fmtEur(n); return <span className="fx-v3-amt tnum" style={{ fontSize: 14 }}>{f.v}<span className="u">{f.u}</span></span>; };

  // La scène : seulement quand le nombre d'offres est publié pour l'exercice.
  const c = d.concurrence;
  const coveragePct = c.coverageTotal > 0 ? (c.coverageCount / c.coverageTotal) * 100 : 0;
  const hasCompetition = coveragePct >= 20 && c.coverageCount >= 50;
  const bucketRows: BarRow[] = c.buckets.map((b) => ({
    key: b.bucket,
    label: t(`fx.mp.s05.bucket.${b.bucket}`),
    value: b.count,
    text: fmtInt(b.count),
    tone: b.bucket === "1" ? "ink" : "blue",
  }));

  const contrats = foldRest(d.topContrats, CONTRATS_CAP);
  const ContratRow = (x: MarchesPageData["topContrats"][number]) => {
    const preferred = locale === "en" && x.objetClairEn ? x.objetClairEn : x.objetClair;
    const objet = preferred ? cutObjet(preferred) : shortObjet(x.objet || "");
    const named = x.titulaires.filter((n) => isNamedTitulaire(n)).map((n) => displayOrgName(n));
    const who = x.holders > 1
      ? fill(t("fx.sec.mp.shared_lot"), { n: x.holders })
      : named[0] ?? (isNamedTitulaire(x.fournisseur) ? displayOrgName(x.fournisseur) : "");
    return (
      <V3Row key={x.numero || objet} href={x.numero ? `${marchesBase}/contrat/${encodeURIComponent(x.numero)}` : null}
        label={objet} subText={who || t("fx.sec.mp.holder_unknown")} amount={<Amt n={x.montant} />} />
    );
  };

  const categoryRows: BarRow[] = d.byCategory.map((cat) => ({
    key: cat.category,
    label: trLabel(cat.category, locale),
    value: cat.amount,
    text: eurTxt(cat.amount),
    sub: fill(t(cat.count === 1 ? "fx.categorie.contrats_count_one" : "fx.categorie.contrats_count_many"), { n: fmtInt(cat.count) }),
    href: hasCategorieFiche ? `${marchesBase}/categorie/${slugifyLabel(cat.category)}` : null,
  }));

  const series = d.yearsSummary.filter((y) => y.total > 0).map((y) => ({ year: y.year, amount: y.total }));
  const top = foldRest(d.top10, 5);
  const TitulaireRow = (ti: MarchesPageData["top10"][number]) => (
    <V3Row key={ti.siret || ti.name} href={ti.siret ? `${marchesBase}/fournisseur/${encodeURIComponent(ti.siret)}` : null}
      label={displayOrgName(ti.name)} subText={fill(t(ti.nbContrats === 1 ? "fx.categorie.contrats_count_one" : "fx.categorie.contrats_count_many"), { n: fmtInt(ti.nbContrats) })}
      amount={<Amt n={ti.amount} />} />
  );

  const shareTitle = fill(t("fx.sec.mp.share_title"), { city: cityName, total: `${total.value} ${total.unit}`, year: d.year });

  return (
    <div className="theme-fusion">
      <Navbar />
      <main id="main-content" tabIndex={-1}>
        <div className="fx-sec fx-v3">
          <div className="fx-sec-grid">
            <div className="fx-sec-a-hero">
              <SectionHero
                kicker={<><Link href={cityBase}>{cityName}</Link> › {t("fx.sec.mp.kicker")}</>}
                title={t("fx.sec.mp.title")}
                value={total.value}
                unit={total.unit}
                captionBefore={t("fx.sec.mp.cap_before")}
                years={years}
                year={d.year}
                basePath={marchesBase}
                meta={fill(t("fx.sec.mp.meta"), { n: fmtInt(d.nb), t: fmtInt(d.nbTitulaires) })}
                shareTitle={shareTitle}
              />
            </div>

            <div className="fx-sec-a-scene">
              {hasCompetition ? (
                <V3Section id="competition" title={fill(t("fx.sec.mp.h.competition"), { year: d.year })}>
                  <p className="fx-sec-sentence" id="concurrence">
                    <b>{fill(t("fx.sec.mp.conc.bold"), { single: fmtInt(c.monoCount), known: fmtInt(c.coverageCount) })}</b>
                    {t("fx.sec.mp.conc.rest")}
                  </p>
                  <Bars rows={bucketRows} />
                  <ShareButton label={t("fx.sec.share_chart")} done={t("fx.sec.shared")} title={shareTitle} object="competition" anchor="concurrence" />
                  {coveragePct < 95 ? (
                    <p className="fx-v3-note">{fill(t("fx.mp.s05.note"), { n: fmtInt(c.coverageCount), total: fmtInt(c.coverageTotal), pct: fmtDec(coveragePct, 0) })}</p>
                  ) : null}
                </V3Section>
              ) : (
                <V3Section id="competition" title={fill(t("fx.sec.mp.h.competition"), { year: d.year })}>
                  <p className="fx-sec-sentence">{t("fx.sec.mp.conc.na")}</p>
                </V3Section>
              )}
            </div>

            <div className="fx-sec-a-rows">
              <V3Section id="contracts" title={fill(t("fx.sec.mp.h.contracts"), { year: d.year })}>
                {contrats.shown.map(ContratRow)}
                {contrats.rest.length > 0 && <V3Fold id="more-contracts" text label={t("fx.v3.voir_plus")}>{contrats.rest.map(ContratRow)}</V3Fold>}
              </V3Section>
            </div>

            <div className="fx-sec-a-cats">
              <V3Section id="categories" title={fill(t("fx.sec.mp.h.categories"), { year: d.year })}>
                <Bars rows={categoryRows} cap={CATEGORIES_CAP} foldId="more-categories" foldLabel={fill(t("fx.sec.mp.categories_more"), { n: fmtInt(d.byCategory.length) })} />
              </V3Section>
            </div>

            <div className="fx-sec-a-years">
              {series.length >= RAIL_MIN ? (
                <V3Section id="years" title={t("fx.sec.years")} sub={t("fx.sec.mp.years_sub")}>
                  <AnneesRail rows={series} />
                </V3Section>
              ) : null}
            </div>

            <div className="fx-sec-a-search">
              <V3Section id="search" title={t("fx.sec.mp.h.search")}>
                <MarchesSearch citySlug={citySlug} categories={d.byCategory.map((x) => x.category)} natures={d.byNature.map((n) => n.nature)} year={d.year} />
              </V3Section>
            </div>

            <div className="fx-sec-a-understand">
              <V3Section id="understand" title={t("fx.sec.understand")}>
                <V3Fold id="plafond" label={t("fx.sec.mp.u.plafond")}><p className="fx-v3-sentence">{t("fx.sec.mp.u.plafond_body")}</p></V3Fold>
                <V3Fold id="single-bid" label={t("fx.sec.mp.u.single")}><p className="fx-v3-sentence">{t("fx.sec.mp.u.single_body")}</p></V3Fold>
                {top.shown.length > 0 ? (
                  <V3Fold id="top-suppliers" label={fill(t("fx.sec.mp.u.top"), { year: d.year })}>
                    {top.shown.map(TitulaireRow)}
                    {top.rest.length > 0 && <V3Fold id="more-suppliers" text label={t("fx.v3.voir_plus")}>{top.rest.map(TitulaireRow)}</V3Fold>}
                  </V3Fold>
                ) : null}
                <V3Fold id="sources" label={t("fx.sec.mp.u.source")}>
                  <p className="fx-v3-sentence">{t("fx.sec.mp.u.source_body")}</p>
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
              <NextDoor href={`${cityBase}/logement`} kicker={t("fx.sec.next")} title={t("fx.sec.mp.next")} sub={t("fx.sec.mp.next_sub")} />
            </div>

            <div className="fx-sec-a-foot">
              <V3Foot>{t("fx.sec.mp.foot")}</V3Foot>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
