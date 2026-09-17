"use client";

import Navbar from "@/components/fusion/Navbar";
import Footer from "@/components/fusion/Footer";
import Link from "@/components/LocalizedLink";
import AnneesRail, { RAIL_MIN } from "@/components/fusion/AnneesRail";
import SectionHero from "@/components/fiche/SectionHero";
import Bars, { type BarRow } from "@/components/fiche/Bars";
import { Door, NextDoor } from "@/components/fiche/Doors";
import { V3Amt, V3Fold, V3Foot, V3Row, V3Section, foldRest } from "@/components/fiche/v3";
import { useT, useLocale } from "@/lib/localeContext";
import { deNom } from "@/lib/nom-commune";
import type { FournisseursData, MarchesData } from "@/lib/commune-marches";
import { displayFournisseur } from "@/lib/fournisseur-display";

type CommuneMeta = { slug: string; nom: string; dep_name: string; reg_name: string; pop: number };

/**
 * The public contracts of a commune (and of Marseille), on the section
 * grammar (2026-09-18) : the year's number and its rail, what the commune
 * buys by category, the largest contracts of the year, the suppliers,
 * Understand, See also, the commune's page next. The explorer by year it
 * replaces lost its readers in eleven seconds and shifted while loading.
 */
export default function CommuneMarchesClient({ commune, data, fournisseurs, sourceUrl, year: requested }: { commune: CommuneMeta; data: MarchesData; fournisseurs: FournisseursData | null; sourceUrl: string; year?: number }) {
  const t = useT();
  const { locale } = useLocale();
  const en = locale === "en";
  const tag = en ? "en-GB" : "fr-FR";
  const int = new Intl.NumberFormat(tag, { maximumFractionDigits: 0 });
  const fill = (key: string, vars: Record<string, string | number>) => {
    let s = t(key);
    for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
    return s;
  };
  const split = (eur: number): { v: string; u: string } => {
    const a = Math.abs(eur);
    if (a >= 1e9) return { v: (eur / 1e9).toLocaleString(tag, { maximumFractionDigits: 2 }), u: "Md€" };
    if (a >= 1e6) return { v: (eur / 1e6).toLocaleString(tag, { maximumFractionDigits: a >= 1e8 ? 0 : 1 }), u: "M€" };
    if (a >= 1e3) return { v: int.format(eur / 1e3), u: "k€" };
    return { v: int.format(eur), u: "€" };
  };
  const euro = (eur: number) => { const { v, u } = split(eur); return `${v} ${u}`; };
  const denom = en ? commune.nom : deNom(commune.nom);
  const base = `/france/${commune.slug}`;

  // Every contract, flat, from the supplier files (lots grouped) ; the year of
  // the page comes from the address, else the last year published.
  type Row = { objet: string; montant: number; annee: number | null; siren: string; nom: string; nb_lots: number; slug?: string };
  const rows: Row[] = [];
  for (const f of fournisseurs?.fournisseurs ?? []) {
    for (const m of f.marches) rows.push({ objet: m.objet, montant: m.montant, annee: m.annee, siren: f.siren, nom: displayFournisseur(f.nom), nb_lots: m.nb_lots, slug: m.slug });
  }
  const byYear = data.by_year.slice().sort((a, b) => a.year - b.year);
  const years = byYear.map((b) => b.year);
  const year = requested && years.includes(requested) ? requested : years[years.length - 1];
  const tot = byYear.find((b) => b.year === year);
  const y0 = years[0] ?? "";
  const y1 = years[years.length - 1] ?? "";
  const ofYear = rows.filter((r) => r.annee === year).sort((a, b) => b.montant - a.montant);
  const { shown, rest } = foldRest(ofYear, 10);
  const series = byYear.map((b) => ({ year: b.year, amount: b.montant, count: b.nb }));
  const total = split(tot?.montant ?? 0);
  const cats: BarRow[] = data.by_category.map((c) => ({
    key: c.categorie,
    label: c.categorie.replace(/ & /g, en ? " and " : " et "),
    value: c.montant,
    text: euro(c.montant),
    sub: c.nb === 1 ? t("fx.fl.n_marche1") : fill("fx.fl.n_marches", { n: c.nb }),
  }));
  const fourn = (fournisseurs?.fournisseurs ?? []).slice().sort((a, b) => b.montant - a.montant);
  const { shown: fournShown, rest: fournRest } = foldRest(fourn, 8);
  const rowOf = (r: Row, i: number) => (
    <V3Row key={`${r.slug ?? r.siren}-${i}`} href={r.slug ? `${base}/marche/${r.slug}` : `${base}/fournisseur/${r.siren}`} label={r.objet || "—"} sub={`${r.nom}${r.nb_lots > 1 ? ` · ${fill("fx.pv.lots", { n: r.nb_lots })}` : ""}`} amount={<V3Amt {...split(r.montant)} />} />
  );

  return (
    <div className="theme-fusion">
      <Navbar />
      <main id="main-content" tabIndex={-1}>
        <div className="fx-sec fx-v3">
          <div className="fx-sec-kicker fx-page-kicker fx-page-kicker--links">
            <Link href={base}>{commune.nom}</Link> › {t("fx.nme3.kicker")}
          </div>
          <div className="fx-sec-grid" data-layout="budget">
            <div className="fx-sec-a-hero">
              <SectionHero
                title={fill("fx.nme.title", { nom: commune.nom, denom })}
                value={total.v}
                unit={total.u}
                captionBefore={t("fx.nme3.cap_before")}
                captionAfter={t("fx.nme3.cap_after")}
                years={years}
                year={year}
                basePath={`${base}/marches`}
                meta={fill("fx.nme3.meta", { nb: int.format(tot?.nb ?? 0), year, total: euro(data.total.montant), y0, y1 })}
                shareTitle={fill("fx.nme3.share", { nom: commune.nom, denom, total: euro(tot?.montant ?? 0), year })}
              />
            </div>

            <div className="fx-sec-a-rail">
              {series.length >= RAIL_MIN ? (
                <div className="fx-sec-years" data-section="years">
                  <div className="fx-page-kicker">{t("fx.sec.years")}</div>
                  <AnneesRail rows={series} current={year} />
                </div>
              ) : null}
            </div>

            <div className="fx-sec-a-table">
              <V3Section id="scene" title={fill("fx.nme3.h.domaines", { y0, y1 })} sub={t("fx.nme3.domaines_sub")}>
                <Bars rows={cats} cap={8} foldId="domaines" foldLabel={fill("fx.nme3.domaines_more", { n: Math.max(cats.length - 8, 0) })} />
              </V3Section>
            </div>

            <div className="fx-sec-a-rows">
              {ofYear.length > 0 ? (
                <V3Section id="rows" title={fill("fx.nme3.h.rows", { year })} hint={t("fx.v3.rows.aide")}>
                  {shown.map(rowOf)}
                  {rest.length > 0 ? <V3Fold id="more-rows" text label={fill("fx.nme3.rows_more", { n: rest.length, year })}>{rest.map((r, i) => rowOf(r, i + shown.length))}</V3Fold> : null}
                </V3Section>
              ) : null}
              {fourn.length > 0 ? (
                <V3Section id="fournisseurs" title={fill("fx.nme3.h.fournisseurs", { y0, y1 })} sub={t("fx.nme3.fournisseurs_sub")} hint={t("fx.v3.rows.aide")}>
                  {fournShown.map((f) => (
                    <V3Row key={f.siren} href={`${base}/fournisseur/${f.siren}`} label={displayFournisseur(f.nom)} sub={f.nb === 1 ? t("fx.fl.n_marche1") : fill("fx.fl.n_marches", { n: f.nb })} amount={<V3Amt {...split(f.montant)} />} />
                  ))}
                  {fournRest.length > 0 ? <V3Fold id="more-fourn" text label={fill("fx.nme3.fournisseurs_more", { n: fournRest.length })}>{fournRest.map((f) => (
                    <V3Row key={f.siren} href={`${base}/fournisseur/${f.siren}`} label={displayFournisseur(f.nom)} sub={f.nb === 1 ? t("fx.fl.n_marche1") : fill("fx.fl.n_marches", { n: f.nb })} amount={<V3Amt {...split(f.montant)} />} />
                  ))}</V3Fold> : null}
                </V3Section>
              ) : null}
            </div>

            <div className="fx-sec-a-understand">
              <V3Section id="understand" title={t("fx.sec.understand")}>
                <V3Fold id="montant" label={t("fx.nme3.u.montant")}><p className="fx-v3-sentence">{t("fx.nme3.u.montant_body")}</p></V3Fold>
                <V3Fold id="source" label={t("fx.nme3.u.source")}>
                  <p className="fx-v3-sentence">{data.coverage_note}{data.total.annees_ecartees?.length ? ` ${fill("fx.pv.annees_ecartees", { years: data.total.annees_ecartees.join(", ") })}` : ""}</p>
                  <p className="fx-v3-sentence"><a href={sourceUrl} target="_blank" rel="noopener noreferrer">{t("fx.natmar.source")} ↗</a></p>
                </V3Fold>
              </V3Section>
            </div>

            <div className="fx-sec-a-related">
              <V3Section id="related" title={t("fx.sec.see_also")}>
                <Door href={base} hard title={fill("fx.nme3.r.commune", { nom: commune.nom })} sub={t("fx.nme3.r.commune_sub")} />
              </V3Section>
            </div>

            <div className="fx-sec-a-next">
              <NextDoor href={base} kicker={t("fx.pv.next.kicker")} title={fill("fx.nme3.next_title", { nom: commune.nom, denom })} sub={t("fx.nme3.next_sub")} />
            </div>

            <div className="fx-sec-a-foot">
              <V3Foot>{data.coverage_note}</V3Foot>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
