"use client";

import { Suspense } from "react";
import PageTOC from "@/components/fusion/PageTOC";
import PageIntro, { IntroStat } from "@/components/fusion/PageIntro";
import SectionHead from "@/components/fusion/SectionHead";
import AnimatedNumber from "@/components/fusion/AnimatedNumber";
import StackedBarTheme from "@/components/fusion/StackedBarTheme";
import BudgetTimeline from "@/components/fusion/BudgetTimeline";
import ChartSource from "@/components/fusion/ChartSource";
import ExportRow from "@/components/fusion/ExportRow";
import PageHook from "@/components/fusion/PageHook";
import { useT } from "@/lib/localeContext";
import type { QuemRecebeData } from "@/lib/br/recife-data";
import { fmtBrlCompact, fmtBrlCompactNum, brlMagnitude, fmtBrl, fmtInt, fmtShare, fill, slugTema } from "@/lib/br/format";
import RecifeQuemRecebeExplorer from "./RecifeQuemRecebeExplorer";

const BASE = "/br/city/recife/quem-recebe";

export default function QuemRecebeClient({ d }: { d: QuemRecebeData }) {
  const t = useT();
  // theme name → its data slug (from the pipeline); fall back to a client slug
  // for the synthesized "others" overflow segment (translated label).
  const temaSlugByName = new Map(d.temas.map((tm) => [tm.tema, tm.slug ?? slugTema(tm.tema)]));
  const maxSeriesYear = Math.max(...d.anos_series.map((x) => x.ano), 0);
  // Drop the current, still-running year: an in-progress year plotted next to
  // full years reads as a cliff-drop, not a real trend. Only complete years.
  const completeSeries = d.anos_series.filter((a) => a.ano < maxSeriesYear);
  const latestYear = completeSeries.length
    ? Math.max(...completeSeries.map((a) => a.ano))
    : maxSeriesYear;
  const timelinePoints = completeSeries.map((a) => ({
    year: a.ano, value: a.total_pago / 1e9, type: "execute" as const,
  }));

  return (
    <main id="main-content" tabIndex={-1}>
      <PageTOC
        items={[
          { id: "sec-temas", label: t("br.recife.qr.temas_h") },
          { id: "sec-recebedores", label: t("br.recife.qr.top_h") },
          { id: "sec-evolucao", label: t("br.recife.budget.evolution_h") },
          { id: "sec-sources", label: t("br.recife.budget.downloads") },
        ]}
      />

      <PageIntro
        kicker={t("br.recife.qr.kicker")}
        title={<>{t("br.recife.qr.title")}</>}
        lede={t("br.recife.qr.subtitle")}
        stats={
          <>
            <IntroStat value={<AnimatedNumber value={d.headline.total_pago} format={fmtBrlCompactNum} />} unit={brlMagnitude(d.headline.total_pago)} label={t("br.recife.qr.stat_pago")} />
            <IntroStat value={<AnimatedNumber value={d.headline.n_organizacoes} format={fmtInt} />} label={t("br.recife.qr.stat_orgs")} />
            <IntroStat value={<AnimatedNumber value={Math.round(d.headline.mediana)} format={fmtBrl} />} label={t("br.recife.qr.stat_mediana")} />
            <IntroStat value={<AnimatedNumber value={d.headline.concentracao_top10 * 100} format={(n) => fmtShare(n / 100)} />} label={t("br.recife.qr.stat_concentracao")} />
          </>
        }
      />

      <section className="fx-section" id="sec-temas">
        <div className="fx-wrap">
          <SectionHead title={t("br.recife.qr.temas_h")} subtitle={t("br.recife.qr.temas_sub")} />
          <StackedBarTheme
            items={d.temas.map((tm) => ({ theme: tm.tema, amount: tm.pago, count: tm.n_organizacoes }))}
            total={d.headline.total_pago}
            concentrationTop10Pct={d.headline.concentracao_top10 * 100}
            year={latestYear}
            basePath={BASE}
            formatAmount={fmtBrlCompact}
            entityNoun={t("br.recife.qr.entity_noun")}
            kicker={t("br.recife.qr.temas_kicker")}
            hrefBuilder={(theme) => `/br/city/recife/tema/${temaSlugByName.get(theme) ?? slugTema(theme)}`}
          />
          {(() => {
            const hookBody = fill(t("br.recife.qr.hook_body"), {
              total: fmtBrlCompact(d.headline.total_pago),
              n: fmtInt(d.headline.n_organizacoes),
              pct: Math.round(d.headline.concentracao_top10 * 100),
              subv: fmtBrlCompact(d.headline.subvencao_total),
            });
            return (
              <PageHook variant="card" cite={t("br.recife.qr.hook_cite")} shareText={hookBody.replace(/<[^>]+>/g, "")}>
                <span dangerouslySetInnerHTML={{ __html: hookBody }} />
              </PageHook>
            );
          })()}
          <p style={{ margin: "10px 0 0", fontSize: 12, color: "var(--muted)", fontStyle: "italic", lineHeight: 1.5 }}>
            {t("br.recife.qr.tema_provenance")}
          </p>
          <ChartSource source={d.source.name ?? t("br.recife.portal")} dataHref={d.source.source_url ?? undefined} />
        </div>
      </section>

      <Suspense fallback={null}>
        <RecifeQuemRecebeExplorer top={d.top_recebedores} temas={d.temas} concentracao={d.headline.concentracao_top10} />
      </Suspense>

      {timelinePoints.length >= 2 && (
        <section className="fx-section" id="sec-evolucao">
          <div className="fx-wrap">
            <SectionHead title={t("br.recife.budget.evolution_h")} subtitle={t("br.recife.qr.evolution_sub")} />
            <BudgetTimeline
              points={timelinePoints}
              activeYear={latestYear}
              showStatus={false}
              formatYTick={(v) => `${v} bi`}
              ariaLabel={t("br.recife.budget.evolution_h")}
            />
            <ChartSource source={d.source.name ?? t("br.recife.portal")} dataHref={d.source.source_url ?? undefined} />
          </div>
        </section>
      )}

      <section className="fx-footer-sources" id="sec-sources">
        <div className="fx-wrap">
          <div className="fx-footer-sources-head">
            <span className="fx-footer-sources-label">{t("br.recife.budget.downloads")}</span>
          </div>
          <p className="fx-footer-sources-meta">
            {d.perimeter} <b>{t("br.recife.source")}</b>:{" "}
            <a href={d.source.source_url ?? "#"} target="_blank" rel="noopener noreferrer">{d.source.name ?? t("br.recife.portal")}</a>
          </p>
          <ExportRow
            title={t("br.recife.budget.downloads")}
            items={[
              { label: "quem_recebe.json", href: "/data/br/recife/quem_recebe.json", primary: true, download: true },
              { label: t("br.recife.source"), href: d.source.source_url ?? undefined, external: true },
            ]}
          />
        </div>
      </section>
    </main>
  );
}
