import type { Metadata } from "next";
import { loadBudget, loadContratos, loadQuemRecebe } from "@/lib/br/recife-data";
import { loadEnrichedPlacesFile } from "@/lib/br/recife-places-data";
import QuemRecebeClient, { type RecifeQrDoors } from "./QuemRecebeClient";
import { sectionAlternates } from "@/lib/seo/page-answer";
import { recifeLocale } from "@/lib/br/recife-locale";

const META_PT = { title: "Recife — Quem recebe", description: "As organizações que recebem dinheiro da Prefeitura do Recife e as subvenções a entidades sem fins lucrativos. Apenas pessoas jurídicas (CNPJ)." };
const META_EN = { title: "Recife — Who gets paid", description: "The organisations that receive money from the City of Recife and the grants to non-profits. Legal entities (CNPJ) only." };

// Portuguese on pt.qipu.org, English on www — with the canonical and hreflang
// of the host answering (lib/site-locale.ts).
export async function generateMetadata(): Promise<Metadata> {
  const locale = await recifeLocale();
  return { ...(locale === "en" ? META_EN : META_PT), ...sectionAlternates("/brasil/recife/quem-recebe", locale) };
}

export default function RecifeQuemRecebePage() {
  const d = loadQuemRecebe();
  // The doors carry the other sections' figures (See also, next section).
  const safe = <T,>(f: () => T): T | null => { try { return f(); } catch { return null; } };
  const bud = safe(() => loadBudget());
  const budYear = bud ? (bud.partial_year ? bud.partial_year.ano - 1 : bud.ano_mais_recente) : null;
  const budAno = bud && budYear ? bud.anos.find((a) => a.ano === budYear) : null;
  const ct = safe(() => loadContratos());
  const pl = safe(() => loadEnrichedPlacesFile());
  const doors: RecifeQrDoors = {
    budget: budAno ? { total: budAno.total_pago, year: budAno.ano } : null,
    contratos: ct ? { ativos: ct.headline.n_ativos, valor: ct.headline.valor_ativo_total } : null,
    lugares: pl ? { n: pl.places.length, total: pl.places.reduce((s, x) => s + (x.obras_total ?? 0), 0) } : null,
  };
  return <QuemRecebeClient d={d} doors={doors} />;
}
