"use client";

import { useT, useLocale } from "@/lib/localeContext";
import { FicheYearBars } from "@/components/fiche";
import type { FicheYearPoint } from "@/components/fiche";
import FicheKpis from "@/components/fusion/FicheKpis";
import BarRow, { type BarRowItem } from "@/components/fusion/BarRow";
import type { FuncaoDetail } from "@/lib/br/recife-data";
import { fmtBrlCompact, fmtShare, fill, mesRange } from "@/lib/br/format";

const SMALL = new Set(["e", "de", "da", "do", "dos", "das", "a", "o", "à", "em", "para"]);
function titleCase(s: string) {
  return s.toLocaleLowerCase("pt-BR").split(/\s+/)
    .map((w, i) => (i > 0 && SMALL.has(w)) ? w : w ? w[0].toLocaleUpperCase("pt-BR") + w.slice(1) : w)
    .join(" ");
}

/**
 * Budget função drilldown fiche — the "sous-postes + variation" drawer body,
 * the br-municipal analog of fusion/PosteFiche. Built from shared primitives
 * (FicheKpis + BarRow + FicheYearBars) so it stays BRL-correct.
 */
export default function RecifeFuncaoFiche({ f }: { f: FuncaoDetail }) {
  const t = useT();
  const { locale } = useLocale();
  const subItems: BarRowItem[] = f.subfuncoes
    .filter((s) => s.pago > 0)
    .map((s) => ({ label: titleCase(s.subfuncao), value: s.pago, display: fmtBrlCompact(s.pago) }));
  const pj = f.partial_year;
  const years: FicheYearPoint[] = f.by_year.map((y) => ({ year: y.ano, value: y.pago, provisional: !!pj && pj.ano === y.ano }));
  const provisionalNote = pj ? fill(t("br.recife.partial_note"), { ano: pj.ano, mes: mesRange(pj.ate_mes, locale) }) : undefined;

  const deltaLabel = f.delta_pct == null ? "—"
    : `${f.delta_pct >= 0 ? "+" : "−"}${fmtShare(Math.abs(f.delta_pct))}`;

  return (
    <div>
      <FicheKpis
        items={[
          { label: fill(t("br.recife.budget.stat_pago"), { y: f.ano }), value: fmtBrlCompact(f.total_pago) },
          { label: t("br.recife.budget.col_share"), value: fmtShare(f.share_of_year) },
          { label: fill(t("br.recife.funcao.yoy"), { y: f.ano - 1 }), value: deltaLabel },
        ]}
      />

      {subItems.length > 0 && (
        <section className="fx-fiche-section">
          <div className="fx-fiche-h">{t("br.recife.funcao.subfuncoes")}</div>
          <BarRow items={subItems} />
        </section>
      )}

      {years.length > 1 && (
        <section className="fx-fiche-section">
          <div className="fx-fiche-h">{t("br.recife.rec.by_year")}</div>
          <FicheYearBars points={years} format={fmtBrlCompact} provisionalNote={provisionalNote} />
        </section>
      )}

      <footer className="fx-fiche-sources">
        <p className="fx-footer-sources-meta">
          {t("br.recife.budget.perimeter")}{" "}
          {f.source.source_url && (
            <a href={f.source.source_url} target="_blank" rel="noopener noreferrer">{t("br.recife.source")} ↗</a>
          )}
        </p>
      </footer>
    </div>
  );
}
