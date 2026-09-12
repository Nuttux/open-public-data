"use client";

import { useState } from "react";
import { useFmtEur } from "@/lib/use-fmt";
import { useT, useLocale } from "@/lib/localeContext";
import { fill } from "@/lib/fmt";

export type RailRow = { year: number; amount: number };
export type RailDelib = { reference: string; titre: string; genres?: string[]; seance?: string | null; source_url?: string | null };

/**
 * Le rail des années — la forme d'une série entière d'un coup d'œil.
 *
 * Pourquoi. Les fiches association, fournisseur et thème montraient leur
 * historique en LISTE : cinq lignes visibles, le reste replié. Le lecteur
 * voyait cinq montants, jamais la courbe. La fiche lieu a réglé le problème
 * avec une barre par exercice sur un seul axe, du premier au dernier : quinze
 * ans tiennent dans 46 pixels de haut et la forme se lit sans déplier.
 *
 * Un exercice sans montant à l'intérieur de l'axe ne reste pas blanc : un
 * blanc se lit comme un zéro. Il porte un pointillé, comme sur la fiche lieu.
 * La liste détaillée reste dessous : la forme d'abord, les chiffres ensuite.
 *
 * Avec `delibs`, une année devient cliquable et ouvre la ou les délibérations
 * du Conseil de Paris qui ont voté cet argent — le titre écrit par la Ville,
 * publié verbatim. Même geste et même rendu que sur la fiche lieu.
 */
export default function AnneesRail({ rows, tone = "x", delibs = null }: {
  rows: RailRow[];
  tone?: "x" | "w";
  delibs?: Record<string, RailDelib[]> | null;
}) {
  const fmtEur = useFmtEur();
  const t = useT();
  const { locale } = useLocale();
  const [sel, setSel] = useState<number | null>(null);
  const pts = rows.filter((r) => Number.isFinite(r.year));
  if (pts.length < 3) return null;
  const de = Math.min(...pts.map((r) => r.year));
  const a = Math.max(...pts.map((r) => r.year));
  const max = Math.max(...pts.map((r) => r.amount), 1);
  const parAn = new Map(pts.map((r) => [r.year, r.amount]));
  const annees: number[] = [];
  for (let y = de; y <= a; y++) annees.push(y);
  const eur = (n: number) => { const { v, u } = fmtEur(n); return `${v} ${u}`; };
  /* Une fiche d'association montre ce que la Ville lui VERSE : on ne garde que
   * les décisions de subvention. Les conventions d'occupation et les marchés
   * rattachés au même lieu relèvent d'une autre ligne. */
  const delibsDe = (y: number) => (delibs?.[String(y)] || []).filter((d) => !d.genres || d.genres.includes("subvention"));
  const aDesDelibs = annees.some((y) => delibsDe(y).length > 0);
  const lignes = sel !== null ? delibsDe(sel) : [];
  return (
    <>
      <div className={`fx-v3-years ${tone} clic`} style={{ marginTop: 4 }}>
        {annees.map((y, i) => {
          const v = parAn.get(y);
          const n = delibsDe(y).length;
          const titre = v === undefined ? `${y} · ${t("fx.lieu.years.non_publie")}` : `${y} · ${eur(v)}`;
          const corps = (
            <>
              {v === undefined ? <em /> : <i style={{ height: Math.max(2, Math.round((v / max) * 40)) }} />}
              {n > 0 && <b aria-hidden="true" />}
              {(i === 0 || i === annees.length - 1) && <span className={i === 0 ? "yr" : "yr end"}>{y}</span>}
            </>
          );
          // Toute année porte le clic : le panneau donne d'abord son montant.
          // Un survol n'existe pas sur un téléphone.
          if (v === undefined) return <div key={y} className="hors" title={titre}>{corps}</div>;
          return (
            <button key={y} type="button" className={sel === y ? "on" : ""}
                    aria-expanded={sel === y} aria-label={titre}
                    title={n ? `${titre} · ${fill(t("fx.lieu.delib.n"), { n })}` : titre}
                    onClick={() => setSel(sel === y ? null : y)}>
              {corps}
            </button>
          );
        })}
      </div>
      {aDesDelibs && sel === null && <p className="fx-v3-aide">{t("fx.lieu.delib.aide")}</p>}
      {sel !== null && (
        <div className="fx-v3-delib">
          <p className="hd">
            <span className="an mono">{sel}</span>
            <span className="mt">{eur(parAn.get(sel) ?? 0)}</span>
            {lignes.length > 0
              ? fill(t("fx.lieu.delib.titre"), { n: lignes.length })
              : t("fx.lieu.delib.aucune")}
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
