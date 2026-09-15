"use client";

import { useState } from "react";
import { useTrack } from "@/lib/analyticsContext";
import { useFmtEur } from "@/lib/use-fmt";
import { useT, useLocale } from "@/lib/localeContext";
import { fill } from "@/lib/fmt";

export type RailRow = { year: number; amount: number; count?: number };
export type RailDelib = { reference: string; titre: string; genres?: string[]; seance?: string | null; source_url?: string | null };

/** Sous trois exercices, une barre par an ne dessine pas de forme : la fiche
 *  garde sa liste de montants. */
export const RAIL_MIN = 3;

/**
 * Le rail des années — la forme d'une série entière d'un coup d'œil, et ses
 * montants sans rien déplier.
 *
 * Pourquoi. Les fiches association, fournisseur et thème montraient leur
 * historique en LISTE : cinq lignes visibles, le reste replié. Le lecteur
 * voyait cinq montants, jamais la courbe. La fiche lieu a réglé le problème
 * avec une barre par exercice sur un seul axe, du premier au dernier : quinze
 * ans tiennent dans 46 pixels de haut et la forme se lit sans déplier.
 *
 * Une forme sans aucun chiffre ne dit pas de combien la série a bougé. Les deux
 * bouts de l'axe portent donc leur montant (d'où la série part, où elle
 * arrive) ; au survol, chaque barre donne son année et son montant ; au clic —
 * le seul geste qui existe sur un téléphone — le panneau sous le rail donne le
 * montant de l'exercice. Le rail remplace ainsi la liste qu'il redoublait.
 *
 * Un exercice sans montant à l'intérieur de l'axe ne reste pas blanc : un
 * blanc se lit comme un zéro. Il porte un pointillé.
 *
 * Avec `delibs`, le panneau publie aussi la ou les délibérations du Conseil de
 * Paris qui ont voté cet argent — le titre écrit par la Ville, verbatim. Sans
 * `delibs` (fournisseurs, thèmes), il ne parle pas de décisions du tout.
 */
export default function AnneesRail({
  rows,
  tone = "x",
  delibs = null,
  genre = "subvention",
  from,
  to,
  format,
  countText,
  current,
  provisional,
}: {
  rows: RailRow[];
  tone?: "x" | "w";
  /** L'exercice de la page : sa barre est en encre, pour se retrouver dans la série. */
  current?: number;
  /** Les exercices pas encore arrêtés (un budget voté, pas exécuté) : barre hachurée. */
  provisional?: number[];
  delibs?: Record<string, RailDelib[]> | null;
  /** Genre de délibération montré sous ce rail (« subvention », « travaux »). */
  genre?: string;
  /** Axe imposé — la fiche lieu pose ses deux lignes d'argent sur le même. */
  from?: number;
  to?: number;
  format?: (n: number) => string;
  /** Précision du panneau pour l'exercice ouvert, ex. « 3 subventions ». */
  countText?: (row: RailRow) => string | null;
}) {
  const fmtEur = useFmtEur();
  const t = useT();
  const { locale } = useLocale();
  const [sel, setSel] = useState<number | null>(null);
  const track = useTrack();
  const eur = format ?? ((n: number) => { const { v, u } = fmtEur(n); return `${v} ${u}`; });
  const pts = rows.filter((r) => Number.isFinite(r.year) && (from == null || r.year >= from) && (to == null || r.year <= to));
  if (pts.length < RAIL_MIN) return null;
  const de = from ?? Math.min(...pts.map((r) => r.year));
  const a = to ?? Math.max(...pts.map((r) => r.year));
  const max = Math.max(...pts.map((r) => r.amount), 1);
  const parAn = new Map(pts.map((r) => [r.year, r]));
  const annees: number[] = [];
  for (let y = de; y <= a; y++) annees.push(y);
  /* Une ligne d'argent ne montre que les décisions de son genre : sur une fiche
   * lieu, une subvention de fonctionnement ne s'affiche pas sous les travaux. */
  const delibsDe = (y: number) => (delibs?.[String(y)] || []).filter((d) => !d.genres || d.genres.includes(genre));
  const aDesDelibs = annees.some((y) => delibsDe(y).length > 0);
  const lignes = sel !== null ? delibsDe(sel) : [];
  const ouverte = sel !== null ? parAn.get(sel) : undefined;
  const precision = ouverte && countText ? countText(ouverte) : null;
  // Les deux bouts de la série, dits au-dessus du rail. Sous l'axe, un montant
  // plus large que sa barre se lisait sous la barre voisine.
  const publies = pts.slice().sort((x, z) => x.year - z.year);
  const premier = publies[0];
  const dernier = publies[publies.length - 1];
  // L'infobulle s'ancre au bord du rail pour les barres des extrémités : centrée,
  // elle déborderait de l'écran d'un téléphone.
  const bord = (i: number) => (i < annees.length / 3 ? " tl" : i >= (annees.length * 2) / 3 ? " tr" : "");
  return (
    <>
      <p className="fx-v3-years-cap tnum">
        <b>{eur(premier.amount)}</b> {t("fx.v3.years.in")} {premier.year} · <b>{eur(dernier.amount)}</b> {t("fx.v3.years.in")} {dernier.year}
      </p>
      <div className={`fx-v3-years ${tone} clic`} style={{ marginTop: 10 }}>
        {annees.map((y, i) => {
          const r = parAn.get(y);
          const n = delibsDe(y).length;
          const titre = r === undefined ? `${y} · ${t("fx.lieu.years.non_publie")}` : `${y} · ${eur(r.amount)}`;
          const bout = i === 0 || i === annees.length - 1;
          const corps = (
            <>
              {r === undefined ? <em /> : <i style={{ height: Math.max(2, Math.round((r.amount / max) * 40)) }} />}
              {n > 0 && <b aria-hidden="true" style={{ bottom: (r === undefined ? 2 : Math.max(2, Math.round((r.amount / max) * 40))) + 4 }} />}
              {bout && (
                <span className={i === 0 ? "yr" : "yr end"}>{y}</span>
              )}
            </>
          );
          if (r === undefined) return <div key={y} className={`hors${bord(i)}`} data-tip={titre}>{corps}</div>;
          return (
            <button key={y} type="button" className={`${sel === y ? "on" : ""}${y === current ? " cur" : ""}${provisional?.includes(y) ? " prov" : ""}${bord(i)}`}
                    aria-expanded={sel === y}
                    aria-current={y === current ? "true" : undefined}
                    aria-label={n ? `${titre} · ${fill(t("fx.lieu.delib.n"), { n })}` : titre}
                    data-tip={titre}
                    onClick={() => { track("chart_element_click", { chart: "annees_rail", year: y, open: sel !== y }); setSel(sel === y ? null : y); }}>
              {corps}
            </button>
          );
        })}
      </div>
      {sel === null && <p className="fx-v3-aide">{t(aDesDelibs ? "fx.lieu.delib.aide" : "fx.v3.years.aide")}</p>}
      {sel !== null && (
        <div className="fx-v3-delib">
          <p className="hd">
            <span className="an mono">{sel}</span>
            <span className="mt">{eur(ouverte?.amount ?? 0)}</span>
            {precision && <span className="ct">{precision}</span>}
            {delibs && (lignes.length > 0
              ? fill(t("fx.lieu.delib.titre"), { n: lignes.length })
              : t("fx.lieu.delib.aucune"))}
          </p>
          {lignes.map((d) => (
            <a key={d.reference + d.titre.slice(0, 20)} className="dl"
               href={d.source_url || undefined} target="_blank" rel="noopener noreferrer"
               lang={locale === "en" ? "fr" : undefined}>
              <span className="ref mono">{d.reference}</span>
              <span className="ti">{d.titre}</span>
            </a>
          ))}
          {lignes.length > 0 && (
            <p className="fx-v3-foot" style={{ marginTop: 10 }}>{t("fx.lieu.delib.note")}</p>
          )}
        </div>
      )}
    </>
  );
}
