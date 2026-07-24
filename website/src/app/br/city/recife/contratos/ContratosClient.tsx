"use client";

import { Suspense } from "react";
import PageTOC from "@/components/fusion/PageTOC";
import PageIntro, { IntroStat } from "@/components/fusion/PageIntro";
import SectionHead from "@/components/fusion/SectionHead";
import AnimatedNumber from "@/components/fusion/AnimatedNumber";
import BarRow, { type BarRowItem } from "@/components/fusion/BarRow";
import ChartSource from "@/components/fusion/ChartSource";
import ExportRow from "@/components/fusion/ExportRow";
import { useT, useLocale } from "@/lib/localeContext";
import type { ContratosData } from "@/lib/br/recife-data";
import { fmtBrlCompact, fmtBrlCompactNum, brlMagnitude, fmtInt, modalidadeLabel, slugModalidade } from "@/lib/br/format";
import RecifeContratosExplorer from "./RecifeContratosExplorer";

const BASE = "/br/city/recife/contratos";

export default function ContratosClient({ d }: { d: ContratosData }) {
  const t = useT();
  const { locale } = useLocale();

  const modalidadeItems: BarRowItem[] = d.modalidade_mix.slice(0, 8).map((m) => ({
    label: modalidadeLabel(m.modalidade, locale), value: m.valor,
    display: `${fmtInt(m.n)} · ${fmtBrlCompact(m.valor)}`,
    href: m.modalidade && m.modalidade !== "—" ? `/br/city/recife/modalidade/${slugModalidade(m.modalidade)}` : undefined,
  }));
  const modalidades = d.modalidade_mix.map((m) => m.modalidade);

  return (
    <main id="main-content" tabIndex={-1}>
      <PageTOC
        items={[
          { id: "sec-modalidade", label: t("br.recife.ct.mix_h") },
          { id: "sec-contratos", label: t("br.recife.ct.list_h") },
          { id: "sec-sources", label: t("br.recife.budget.downloads") },
        ]}
      />

      <PageIntro
        kicker={t("br.recife.ct.kicker")}
        title={<>{t("br.recife.ct.title")}</>}
        lede={t("br.recife.ct.subtitle")}
        stats={
          <>
            <IntroStat value={<AnimatedNumber value={d.headline.n_contratos} format={fmtInt} />} label={t("br.recife.ct.stat_total")} />
            <IntroStat value={<AnimatedNumber value={d.headline.n_ativos} format={fmtInt} />} label={t("br.recife.ct.stat_ativos")} />
            <IntroStat value={<AnimatedNumber value={d.headline.valor_ativo_total} format={fmtBrlCompactNum} />} unit={brlMagnitude(d.headline.valor_ativo_total)} label={t("br.recife.ct.stat_valor")} />
          </>
        }
      />

      <section className="fx-section" id="sec-modalidade">
        <div className="fx-wrap">
          <SectionHead title={t("br.recife.ct.mix_h")} subtitle={t("br.recife.ct.mix_sub")} />
          <BarRow items={modalidadeItems} reveal />
          <ChartSource source={d.source.name ?? t("br.recife.portal")} dataHref={d.source.source_url ?? undefined} />
        </div>
      </section>

      <Suspense fallback={null}>
        <RecifeContratosExplorer
          seed={d.contratos}
          modalidades={modalidades}
          orgaos={d.orgaos}
          anos={d.anos}
          nTotal={d.headline.n_contratos}
        />
      </Suspense>

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
              { label: "contratos.json", href: "/data/br/recife/contratos.json", primary: true, download: true },
              { label: "licitacoes.json", href: "/data/br/recife/licitacoes.json", download: true },
              { label: t("br.recife.source"), href: d.source.source_url ?? undefined, external: true },
            ]}
          />
        </div>
      </section>
    </main>
  );
}
