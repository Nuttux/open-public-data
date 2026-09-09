"use client";

import { useState } from "react";
import Link from "next/link";
import type { BudgetNatureFiche } from "@/lib/fusion-data";
import { useT, useLocale } from "@/lib/localeContext";
import { fill, numLocale, sufOrdinal } from "@/lib/fmt";
import { trLabel } from "@/lib/label-translate";
import { V3Foot, V3Fold, V3Section } from "@/components/fiche/v3";
import { NATURE_LABELS } from "@/lib/budget-natures";
import fonctionLabels from "@/data/budget-fonction-labels.json";

type Props = { nature: BudgetNatureFiche };
type FonctionLabel = { fr: string; en: string; sub_fr?: string; sub_en?: string };
const FONCTIONS: Record<string, FonctionLabel> = fonctionLabels as Record<string, FonctionLabel>;
const POSTES_CAP = 6;

/**
 * Fiche de nature (2026-09-09) — le transposé de la fiche de poste, lue
 * depuis les mêmes trois questions : c'est quoi (une phrase : les postes qui
 * en prennent le plus), c'est beaucoup et ça monte (le chiffre, deux repères,
 * la tendance en barres), où ça va (les postes en barres, dépliables sur
 * leurs plus grosses lignes). Chaque poste renvoie à sa fiche, qui fait le
 * chemin inverse.
 */
export default function NatureFiche({ nature }: Props) {
  const t = useT();
  const { locale } = useLocale();
  const fl: "fr" | "en" = locale === "en" ? "en" : "fr";
  const locStr = numLocale(fl);
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const fmtM = (n: number) => `${Math.round(n / 1e6).toLocaleString(locStr)} M €`;
  const fmtAmt = (n: number): { v: string; u: string } =>
    n >= 1e9 ? { v: new Intl.NumberFormat(locStr, { maximumFractionDigits: 2 }).format(n / 1e9), u: t("fx.s.md_eur") } : { v: Math.round(n / 1e6).toLocaleString(locStr), u: t("fx.s.m_eur") };
  const pct1 = (n: number) => n.toFixed(1).replace(".", fl === "en" ? "." : ",");
  const signed = (x: number) => `${x >= 0 ? "+" : "−"}${pct1(Math.abs(x))} %`;
  const label = NATURE_LABELS[nature.key][fl];
  const posteName = (raw: string) => trLabel(raw.replace(/\s\((D|R)\)$/, ""), locale);
  const fonctionName = (key?: string) => (key && FONCTIONS[key] ? FONCTIONS[key][fl] : key ? trLabel(key, locale) : "");

  const shown = nature.byPoste.slice(0, POSTES_CAP);
  const rest = nature.byPoste.slice(POSTES_CAP);
  const shownPct = nature.total > 0 ? Math.round((shown.reduce((s, p) => s + p.value, 0) / nature.total) * 100) : 0;
  const maxPoste = Math.max(...nature.byPoste.map((p) => p.value), 1);
  const { v, u } = fmtAmt(nature.total);
  const first = nature.series[0];
  const deltaSince = first && first.year !== nature.year && first.value > 0 ? ((nature.total - first.value) / first.value) * 100 : null;
  const maxSeries = Math.max(...nature.series.map((s) => s.value), 1);
  const lead = shown.slice(0, 3).map((p) => posteName(p.label)).join(", ");
  const rankTxt = `${nature.rank}${sufOrdinal(nature.rank, fl)}`;

  const Row = (p: BudgetNatureFiche["byPoste"][number]) => {
    const isOpen = open.has(p.slug);
    return (
      <div key={p.slug}>
        <button type="button" className={`fx-v3-mission${isOpen ? " open" : ""}`} onClick={() => setOpen((s) => { const n = new Set(s); if (n.has(p.slug)) n.delete(p.slug); else n.add(p.slug); return n; })} aria-expanded={isOpen}>
          <span className="l">
            {posteName(p.label)}
            <span className="chev" aria-hidden="true">{isOpen ? "▾" : "▸"}</span>
            <span className="m">{fill(t("fx.nature.v3.share_of"), { pct: Math.round(p.sharePct) })}</span>
          </span>
          <span className="t" aria-hidden="true"><span style={{ width: `${Math.max(1.5, (p.value / maxPoste) * 100)}%` }} /></span>
          <span className="v tnum">{fmtAmt(p.value).v}<span className="u">{fmtAmt(p.value).u}</span></span>
        </button>
        {isOpen && (
          <>
            {p.lines.map((it, i) => (
              <div key={i} className="fx-v3-mline">
                <span className="l">{it.name}</span>
                <span className="a tnum">{fmtAmt(it.value).v}<span className="u">{fmtAmt(it.value).u}</span></span>
                {it.fonction && <span className="s">{fonctionName(it.fonction).toLowerCase()}</span>}
              </div>
            ))}
            <Link href={`/fr/city/paris/budget/poste/${p.slug}?year=${nature.year}`} scroll={false} className="fx-v3-mline fx-row-link" style={{ color: "var(--bleu)" }}>
              <span className="l">{fill(t("fx.nature.v3.open_poste"), { p: posteName(p.label) })} <span aria-hidden="true">→</span></span>
            </Link>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="fx-v3 fx-poste-v3">
      {shown.length > 0 && (
        <p className="fx-v3-lead">
          {fill(t("fx.nature.v3.lead"), { l: lead, rank: rankTxt, n: nature.nbNatures, year: nature.year })}
        </p>
      )}

      <div className="fx-v3-herogrid">
        <div>
          <div className="fx-v3-hero-num tnum">{v}<span className="u">{u}</span></div>
          <div className="fx-v3-hero-cap">{fill(t(nature.typeBudget === "vote" ? "fx.nature.v3.cap_vote" : "fx.nature.v3.cap"), { year: nature.year, nature: label.toLowerCase() })}</div>
          <div className="fx-v3-hero-meta">
            {fill(t("fx.poste.v3.ctx_dep"), { share: Math.round(nature.shareOfDepensesPct) })}
            {nature.perHabitant > 0 ? ` · ${fill(t("fx.poste.v3.par_hab"), { n: Math.round(nature.perHabitant).toLocaleString(locStr) })}` : ""}
          </div>
        </div>
        {nature.series.length > 1 && (
          <div className="fx-v3-trend">
            <div className="t">
              {nature.deltaPct != null && <b>{signed(nature.deltaPct)} {t("fx.poste.v3.sur_un_an")}</b>}
              {deltaSince != null && <span> · {signed(deltaSince)} {fill(t("fx.poste.v3.depuis"), { y: first.year })}</span>}
            </div>
            <div className="bars" aria-hidden="true">
              {nature.series.map((s) => (
                <div key={s.year} className={`${s.year === nature.year ? "now" : ""} ${s.type === "vote" ? "vote" : ""}`.trim()} title={`${s.year} · ${fmtM(s.value)}`}>
                  <b style={{ height: Math.max(3, Math.round((s.value / maxSeries) * 50)) }} />
                  <span>{s.year}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {nature.byPoste.length > 0 && (
        <V3Section
          title={fill(t("fx.nature.v3.h.where"), { nature: label.toLowerCase() })}
          sub={fill(t(shown.length === 1 ? "fx.nature.v3.h.where_sub1" : "fx.nature.v3.h.where_sub"), { n: shown.length, pct: shownPct })}
        >
          {shown.map(Row)}
          {rest.length > 0 && (
            <V3Fold text label={fill(t(rest.length === 1 ? "fx.nature.v3.more1" : "fx.nature.v3.more"), { n: rest.length, a: fmtM(rest[0].value), b: fmtM(rest[rest.length - 1].value) })}>
              {rest.map(Row)}
            </V3Fold>
          )}
        </V3Section>
      )}

      <V3Foot>
        {nature.hasImputed && <>{t("fx.poste.v3.imputation")} </>}
        {fill(t("fx.nature.v3.source"), { year: nature.year, pct: Math.round(nature.coveragePct) })}{" "}
        <a href={`https://opendata.paris.fr/explore/dataset/comptes-administratifs-budgets-principaux-a-partir-de-2019-m57-ville-departement/table/?refine.exercice_comptable=${nature.year}`} target="_blank" rel="noopener noreferrer">{t("fx.poste.v3.source_link")}</a>
      </V3Foot>
    </div>
  );
}
