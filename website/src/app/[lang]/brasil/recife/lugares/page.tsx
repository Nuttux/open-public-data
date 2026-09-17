import type { Metadata } from "next";
import "@/app/fusion.css";

import LieuxClient from "@/app/[lang]/france/paris/lieux/LieuxClient";
import PageJsonLd from "@/components/seo/PageJsonLd";
import { loadRecifeLieux, recifeLugaresAnswer } from "@/lib/br/recife-lieux-section";
import { RECIFE_LIEUX } from "@/lib/br/recife-lieux";
import { loadBudget, loadContratos, loadQuemRecebe } from "@/lib/br/recife-data";
import { recifeLocale } from "@/lib/br/recife-locale";
import { answerMetadata } from "@/lib/seo/page-answer";
import type { LieuxDoor, LieuxDoors } from "@/lib/lieux-doors";

const PATH = "/brasil/recife/lugares";

// Recife's Lugares on the section grammar (2026-09-18) : the Paris client,
// fed by the City's directory of facilities and the works contracts naming
// them. Portuguese on pt.qipu.org, English on www.
export async function generateMetadata(): Promise<Metadata> {
  const locale = await recifeLocale();
  return answerMetadata(recifeLugaresAnswer(loadRecifeLieux(), locale), PATH, locale);
}

export default async function LugaresPage({ searchParams }: { searchParams: Promise<{ familia?: string; bairro?: string }> }) {
  const sp = await searchParams;
  const locale = await recifeLocale();
  const r = loadRecifeLieux();
  const a = recifeLugaresAnswer(r, locale);
  const nl = locale === "en" ? "en-US" : "pt-BR";
  // The doors carry the other sections' figures (See also, next section).
  const safe = <T,>(f: () => T): T | null => { try { return f(); } catch { return null; } };
  const ct = safe(() => loadContratos());
  const qr = safe(() => loadQuemRecebe());
  const bud = safe(() => loadBudget());
  const complete = bud ? bud.anos_disponiveis.filter((y) => bud.curva_mensal.some((c) => c.ano === y && c.mes === 12)) : [];
  const budYear = complete.length ? Math.max(...complete) : bud ? Math.max(...bud.anos_disponiveis) : null;
  const budTotal = bud && budYear ? bud.anos.find((x) => x.ano === budYear)?.total_pago ?? null : null;
  const doors: LieuxDoors = {
    related: ([
      ct ? { href: `${RECIFE_LIEUX.hub}/contratos`, title: "fx.sec.lieux.r.contratos", sub: "fx.sec.lieux.r.contratos_sub", vars: { n: ct.headline.n_ativos.toLocaleString(nl) }, amount: ct.headline.valor_ativo_total } : null,
      qr ? { href: `${RECIFE_LIEUX.hub}/quem-recebe`, title: "fx.sec.lieux.r.quem", sub: "fx.sec.lieux.r.quem_sub", vars: { n: qr.headline.n_organizacoes.toLocaleString(nl), y0: Math.min(...qr.anos_disponiveis), y1: Math.max(...qr.anos_disponiveis) }, amount: qr.headline.total_pago } : null,
    ] as (LieuxDoor | null)[]).filter((d): d is LieuxDoor => d !== null),
    next: budYear && budTotal != null
      ? { href: `${RECIFE_LIEUX.hub}/budget?year=${budYear}`, title: "fx.sec.lieux.next_orc", sub: "fx.sec.lieux.next_orc_sub", vars: { year: budYear }, amount: budTotal }
      : { href: `${RECIFE_LIEUX.hub}/budget`, title: "fx.sec.lieux.next_orc", sub: "fx.sec.lieux.next_orc_sub_noyear" },
  };
  const city = { ...RECIFE_LIEUX, sources: [{ label: "dados.recife.pe.gov.br", href: r.source.source_url ?? RECIFE_LIEUX.sources[0].href }] };
  return (
    <>
      <PageJsonLd title={a.title} description={a.answer} path={PATH} locale={locale} dateModified={r.generatedAt} creator="Prefeitura do Recife" spatialCoverage="Recife, Pernambuco" keywords={["Recife", "equipamentos públicos", "obras", "escolas", "praças", "unidades de saúde"]} />
      <LieuxClient lieux={r.lieux} section={r.section} doors={doors} city={city} initial={{ famille: sp.familia ?? null, area: sp.bairro ?? null }} />
    </>
  );
}
