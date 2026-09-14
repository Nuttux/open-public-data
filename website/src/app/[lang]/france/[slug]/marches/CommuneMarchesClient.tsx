"use client";

import Link from "@/components/LocalizedLink";
import Navbar from "@/components/fusion/Navbar";
import Footer from "@/components/fusion/Footer";
import ChartSource from "@/components/fusion/ChartSource";
import { V3Amt, V3Fold, V3Foot, V3Row, V3Section, foldRest } from "@/components/fiche/v3";
import { useT, useLocale } from "@/lib/localeContext";
import { deNom } from "@/lib/nom-commune";
import type { FournisseursData, MarchesData } from "@/lib/commune-marches";
import { displayFournisseur } from "@/lib/fournisseur-display";

type CommuneMeta = { slug: string; nom: string; dep_name: string; reg_name: string; pop: number };

/**
 * L'explorateur marchés d'une commune nationale (bloc 3, 2026-09-10) : la
 * page à part quand la section « ce que la commune achète » déborde (plus de
 * 50 marchés). Tous les marchés, année par année, chaque fournisseur ouvre sa
 * fiche locale. Grammaire v3, plus de cartes KPI.
 */
export default function CommuneMarchesClient({ commune, data, fournisseurs, sourceUrl }: { commune: CommuneMeta; data: MarchesData; fournisseurs: FournisseursData | null; sourceUrl: string }) {
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

  // Tous les marchés, à plat, depuis les fiches fournisseurs (lots regroupés) ;
  // les entrepreneurs individuels n'y sont pas : on complète avec le total.
  type Row = { objet: string; montant: number; annee: number | null; siren: string; nom: string; nb_lots: number; slug?: string };
  const rows: Row[] = [];
  for (const f of fournisseurs?.fournisseurs ?? []) {
    for (const m of f.marches) rows.push({ objet: m.objet, montant: m.montant, annee: m.annee, siren: f.siren, nom: displayFournisseur(f.nom), nb_lots: m.nb_lots, slug: m.slug });
  }
  const years = Array.from(new Set(rows.map((r) => r.annee).filter((y): y is number => y != null))).sort((a, b) => b - a);
  const y0 = data.by_year[0]?.year ?? "";
  const y1 = data.by_year[data.by_year.length - 1]?.year ?? "";
  const topFourn = (fournisseurs?.fournisseurs ?? []).slice(0, 8);

  return (
    <div className="theme-fusion">
      <Navbar />
      <main id="main-content" tabIndex={-1}>
        <div className="fx-wrap fx-v3 fx-pv" style={{ paddingTop: 48, paddingBottom: 48 }}>
          <p className="fx-pv-kicker"><Link href={`/france/${commune.slug}#achats`} className="fx-pv-link">{fill("fx.nme.retour", { nom: commune.nom, denom: deNom(commune.nom) })}</Link> · {commune.dep_name}</p>
          <h1 className="fx-pv-title">{fill("fx.nme.title", { nom: commune.nom, denom: deNom(commune.nom) })}</h1>
          <p className="fx-v3-lead">{fill("fx.nme.lede", { nb: int.format(data.total.nb_marches), y0, y1, montant: euro(data.total.montant) })}</p>

          <div className="fx-pv-two" style={{ marginTop: 24 }}>
            <div>
              <div className="fx-pv-colhead"><span>{t("fx.pv.domaines")}</span><span className="tnum">{y0}–{y1}</span></div>
              {data.by_category.slice(0, 8).map((c) => (
                <div key={c.categorie} className="fx-pv-line"><span>{c.categorie.replace(/ & /g, en ? " and " : " et ")}<span className="fx-pv-sub2">{(c.nb === 1 ? t("fx.fl.n_marche1") : fill("fx.fl.n_marches", { n: c.nb }))}</span></span><V3Amt {...split(c.montant)} /></div>
              ))}
            </div>
            <div>
              <div className="fx-pv-colhead"><span>{t("fx.pv.fournisseurs")}</span><span className="tnum">{fill("fx.pv.top_n", { n: topFourn.length })}</span></div>
              {topFourn.map((f) => (
                <Link key={f.siren} href={`/france/${commune.slug}/fournisseur/${f.siren}`} className="fx-pv-line fx-pv-linerow">
                  <span>{displayFournisseur(f.nom)}<span className="muted" aria-hidden="true"> →</span><span className="fx-pv-sub2">{(f.nb === 1 ? t("fx.fl.n_marche1") : fill("fx.fl.n_marches", { n: f.nb }))}</span></span>
                  <V3Amt {...split(f.montant)} />
                </Link>
              ))}
            </div>
          </div>

          {years.map((y) => {
            const ofYear = rows.filter((r) => r.annee === y).sort((a, b) => b.montant - a.montant);
            const tot = data.by_year.find((b) => b.year === y);
            const { shown, rest } = foldRest(ofYear, 10);
            return (
              <V3Section key={y} title={fill("fx.nme.year_h", { year: y, nb: int.format(tot?.nb ?? ofYear.length), montant: euro(tot?.montant ?? ofYear.reduce((s, r) => s + r.montant, 0)) })}>
                {shown.map((r, i) => (
                  <V3Row key={i} href={r.slug ? `/france/${commune.slug}/marche/${r.slug}` : `/france/${commune.slug}/fournisseur/${r.siren}`} label={r.objet || "—"} sub={`${r.nom}${r.nb_lots > 1 ? ` · ${fill("fx.pv.lots", { n: r.nb_lots })}` : ""}`} amount={<V3Amt {...split(r.montant)} />} />
                ))}
                {rest.length > 0 && (
                  <V3Fold label={fill("fx.nme.voir_annee", { n: rest.length, year: y })} text>
                    {rest.map((r, i) => (
                      <V3Row key={i} href={r.slug ? `/france/${commune.slug}/marche/${r.slug}` : `/france/${commune.slug}/fournisseur/${r.siren}`} label={r.objet || "—"} sub={`${r.nom}${r.nb_lots > 1 ? ` · ${fill("fx.pv.lots", { n: r.nb_lots })}` : ""}`} amount={<V3Amt {...split(r.montant)} />} />
                    ))}
                  </V3Fold>
                )}
              </V3Section>
            );
          })}

          <V3Foot>
            {data.coverage_note}
            {data.total.annees_ecartees?.length ? ` ${fill("fx.pv.annees_ecartees", { years: data.total.annees_ecartees.join(", ") })}` : ""}
          </V3Foot>
          <ChartSource source={t("fx.natmar.source")} dataHref={sourceUrl} methodAnchor="c-villes" />
        </div>
      </main>
      <Footer />
    </div>
  );
}
