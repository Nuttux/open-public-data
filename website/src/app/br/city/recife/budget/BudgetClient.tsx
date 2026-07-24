"use client";

// Direct imports — the fusion barrel pulls in server-only components that read
// node:fs (fails to bundle client-side). Mirrors the Paris budget client.
import PageTOC from "@/components/fusion/PageTOC";
import PageIntro, { IntroStat } from "@/components/fusion/PageIntro";
import SectionHead from "@/components/fusion/SectionHead";
import YearPicker from "@/components/fusion/YearPicker";
import AnimatedNumber from "@/components/fusion/AnimatedNumber";
import BarRow, { type BarRowItem } from "@/components/fusion/BarRow";
import BudgetTimeline from "@/components/fusion/BudgetTimeline";
import ChartSource from "@/components/fusion/ChartSource";
import ExportRow from "@/components/fusion/ExportRow";
import { useT } from "@/lib/localeContext";
import type { BudgetData } from "@/lib/br/recife-data";
import { fmtBrl, fmtBrlCompact, fmtBrlCompactNum, brlMagnitude, fmtShare, fill, funcaoSlug } from "@/lib/br/format";

const SMALL = new Set(["e", "de", "da", "do", "dos", "das", "a", "o", "à", "em", "para"]);
function titleCase(s: string) {
  return s.toLocaleLowerCase("pt-BR").split(/\s+/)
    .map((w, i) => (i > 0 && SMALL.has(w)) ? w : w ? w[0].toLocaleUpperCase("pt-BR") + w.slice(1) : w)
    .join(" ");
}

const BASE = "/br/city/recife/budget";

export default function BudgetClient({ d, ano }: { d: BudgetData; ano?: number }) {
  const t = useT();
  // Only show full (12-month) years: a partial current year (e.g. 2026 through
  // month 5) would crater the comparison and there is no voted/orçado figure in
  // the source to annualise it. Fall back to all years if none is complete.
  const completeYears = d.anos_disponiveis.filter((y) => d.curva_mensal.some((c) => c.ano === y && c.mes === 12));
  const shownYears = completeYears.length ? completeYears : d.anos_disponiveis;
  const defaultAno = Math.max(...shownYears);
  const year = ano && shownYears.includes(ano) ? ano : defaultAno;

  const anoData = d.anos.find((a) => a.ano === year) ?? d.anos[d.anos.length - 1];
  const funcoes = anoData.funcoes.filter((f) => f.pago > 0);

  const funcaoItems: BarRowItem[] = funcoes.map((f) => ({
    label: titleCase(f.funcao),
    value: f.pago,
    display: `${fmtBrlCompact(f.pago)} · ${fmtShare(f.pago / anoData.total_pago)}`,
    href: `${BASE}/funcao/${funcaoSlug(f.funcao)}?year=${year}`,
    sub: f.subfuncoes.length ? f.subfuncoes.slice(0, 3).map((s) => titleCase(s.subfuncao)).join(" · ") : undefined,
  }));

  const timelinePoints = d.anos
    .filter((a) => shownYears.includes(a.ano))
    .map((a) => ({ year: a.ano, value: a.total_pago / 1e9, type: "execute" as const }));

  const pop = d.populacao?.populacao;
  const perCapita = pop ? anoData.total_pago / pop : null;
  const restos = anoData.total_empenhado - anoData.total_pago;

  return (
    <main id="main-content" tabIndex={-1}>
      <PageTOC
        items={[
          { id: "sec-funcao", label: t("br.recife.budget.funcao_h") },
          { id: "sec-evolucao", label: t("br.recife.budget.evolution_h") },
          { id: "sec-sources", label: t("br.recife.budget.downloads") },
        ]}
      />

      <PageIntro
        kicker={t("br.recife.budget.kicker")}
        title={<>{t("br.recife.budget.title")}</>}
        lede={t("br.recife.budget.subtitle")}
        actions={
          <YearPicker
            years={shownYears.slice().sort((a, b) => a - b)}
            current={year}
            basePath={BASE}
            label={t("br.recife.budget.exercicio")}
          />
        }
        stats={
          <>
            <IntroStat
              value={<AnimatedNumber value={anoData.total_pago} format={fmtBrlCompactNum} />}
              unit={brlMagnitude(anoData.total_pago)}
              label={fill(t("br.recife.budget.stat_pago"), { y: year })}
            />
            {perCapita != null && (
              <IntroStat
                value={<AnimatedNumber value={Math.round(perCapita)} format={fmtBrl} />}
                label={fill(t("br.recife.budget.stat_percapita"), { y: year })}
              />
            )}
            <IntroStat
              value={<AnimatedNumber value={anoData.total_empenhado} format={fmtBrlCompactNum} />}
              unit={brlMagnitude(anoData.total_empenhado)}
              label={fill(t("br.recife.budget.stat_empenhado"), { y: year })}
            />
            <IntroStat
              value={<AnimatedNumber value={restos} format={fmtBrlCompactNum} />}
              unit={brlMagnitude(restos)}
              label={t("br.recife.budget.stat_restos")}
            />
          </>
        }
      />

      <section className="fx-section" id="sec-funcao">
        <div className="fx-wrap">
          <SectionHead title={t("br.recife.budget.funcao_h")} subtitle={fill(t("br.recife.budget.funcao_sub"), { y: year })} />
          <BarRow items={funcaoItems} max={funcaoItems[0]?.value} reveal />
          <ChartSource source={d.source.name ?? t("br.recife.portal")} dataHref={d.source.source_url ?? undefined} />
        </div>
      </section>

      <section className="fx-section" id="sec-evolucao">
        <div className="fx-wrap">
          <SectionHead title={t("br.recife.budget.evolution_h")} subtitle={t("br.recife.budget.evolution_sub")} />
          <BudgetTimeline
            points={timelinePoints}
            activeYear={year}
            showStatus={false}
            formatYTick={(v) => `${v} bi`}
            activeBadge={String(year)}
            ariaLabel={t("br.recife.budget.evolution_h")}
          />
          <ChartSource source={d.source.name ?? t("br.recife.portal")} dataHref={d.source.source_url ?? undefined} />
        </div>
      </section>

      <section className="fx-footer-sources" id="sec-sources">
        <div className="fx-wrap">
          <div className="fx-footer-sources-head">
            <span className="fx-footer-sources-label">{t("br.recife.budget.downloads")}</span>
          </div>
          <p className="fx-footer-sources-meta">
            <b>{t("br.recife.source")}</b>: {t("br.recife.budget.perimeter")}{" "}
            <a href={d.source.source_url ?? "#"} target="_blank" rel="noopener noreferrer">{d.source.name ?? t("br.recife.portal")}</a>
            {d.populacao ? ` · ${t("br.recife.budget.pop_source")}: ${d.populacao.source}` : ""}
          </p>
          <ExportRow
            title={t("br.recife.budget.downloads")}
            items={[
              { label: "budget.json", href: "/data/br/recife/budget.json", primary: true, download: true },
              { label: t("br.recife.source"), href: d.source.source_url ?? undefined, external: true },
            ]}
          />
        </div>
      </section>
    </main>
  );
}
