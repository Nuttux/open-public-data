"use client";

import { useFmtEur } from "@/lib/use-fmt";
import { useT } from "@/lib/localeContext";

export type RailRow = { year: number; amount: number };

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
 */
export default function AnneesRail({ rows, tone = "x" }: { rows: RailRow[]; tone?: "x" | "w" }) {
  const fmtEur = useFmtEur();
  const t = useT();
  const pts = rows.filter((r) => Number.isFinite(r.year));
  if (pts.length < 3) return null;
  const de = Math.min(...pts.map((r) => r.year));
  const a = Math.max(...pts.map((r) => r.year));
  const max = Math.max(...pts.map((r) => r.amount), 1);
  const parAn = new Map(pts.map((r) => [r.year, r.amount]));
  const annees: number[] = [];
  for (let y = de; y <= a; y++) annees.push(y);
  const eur = (n: number) => { const { v, u } = fmtEur(n); return `${v} ${u}`; };
  return (
    <div className={`fx-v3-years ${tone}`} aria-hidden="true" style={{ marginTop: 4 }}>
      {annees.map((y, i) => {
        const v = parAn.get(y);
        return (
          <div key={y} className={v === undefined ? "hors" : undefined}
               title={v === undefined ? `${y} · ${t("fx.lieu.years.non_publie")}` : `${y} · ${eur(v)}`}>
            {v === undefined ? <em /> : <i style={{ height: Math.max(2, Math.round((v / max) * 40)) }} />}
            {(i === 0 || i === annees.length - 1) && <span className={i === 0 ? "yr" : "yr end"}>{y}</span>}
          </div>
        );
      })}
    </div>
  );
}
