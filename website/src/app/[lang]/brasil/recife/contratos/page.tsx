import type { Metadata } from "next";
import { loadBudget, loadContratos, loadQuemRecebe, type ContratoItem } from "@/lib/br/recife-data";
import { loadEnrichedPlacesFile } from "@/lib/br/recife-places-data";
import ContratosClient, { type RecifeCtDoors } from "./ContratosClient";
import { sectionAlternates } from "@/lib/seo/page-answer";
import { fmtBrlCompact, fmtInt } from "@/lib/br/format";
import { recifeLocale } from "@/lib/br/recife-locale";

const META_PT = { title: "Recife — Contratos", description: "Cada contrato administrativo da Prefeitura do Recife: objeto, fornecedor, valor e vigência, mais o contexto das licitações — dos dados abertos da cidade." };
const META_EN = { title: "Recife — Contracts", description: "Every administrative contract of the City of Recife: object, supplier, value and term, plus the procurement context, from the city's open data." };

// Portuguese on pt.qipu.org, English on www — with the canonical and hreflang
// of the host answering (lib/site-locale.ts).
export async function generateMetadata(): Promise<Metadata> {
  const locale = await recifeLocale();
  const h = loadContratos().headline;
  const title = locale === "en"
    ? `Recife contracts: ${fmtBrlCompact(h.valor_ativo_total)} in force across ${fmtInt(h.n_ativos)} contracts`
    : `Contratos do Recife: ${fmtBrlCompact(h.valor_ativo_total)} em vigor em ${fmtInt(h.n_ativos)} contratos`;
  return { ...(locale === "en" ? META_EN: META_PT), title, ...sectionAlternates("/brasil/recife/contratos", locale) };
}

const hasValue = (c: ContratoItem) => c.valor != null && c.valor > 0 && !c.valor_suspeito;

export default function RecifeContratosPage() {
  const data = loadContratos();
  // The page ships the largest contracts ; the client fetches the whole file
  // (contratos.json, a few MB) on the first search — the Paris/SF pattern.
  const largest = data.contratos.filter(hasValue).slice().sort((a, b) => (b.valor as number) - (a.valor as number)).slice(0, 60);
  const by = new Map<number, number>();
  for (const c of data.contratos) if (c.ano && hasValue(c)) by.set(c.ano, (by.get(c.ano) ?? 0) + (c.valor as number));
  const series = [...by.entries()].filter(([, v]) => v > 0).map(([year, amount]) => ({ year, amount })).sort((a, b) => a.year - b.year);
  const safe = <T,>(f: () => T): T | null => { try { return f(); } catch { return null; } };
  const bud = safe(() => loadBudget());
  const budYear = bud ? (bud.partial_year ? bud.partial_year.ano - 1 : bud.ano_mais_recente) : null;
  const budAno = bud && budYear ? bud.anos.find((a) => a.ano === budYear) : null;
  const qr = safe(() => loadQuemRecebe());
  const pl = safe(() => loadEnrichedPlacesFile());
  const doors: RecifeCtDoors = {
    budget: budAno ? { total: budAno.total_pago, year: budAno.ano } : null,
    quem: qr ? { total: qr.headline.total_pago, n: qr.headline.n_organizacoes, y0: Math.min(...qr.anos_disponiveis), y1: Math.max(...qr.anos_disponiveis) } : null,
    lugares: pl ? { n: pl.places.length, total: pl.places.reduce((s, x) => s + (x.obras_total ?? 0), 0) } : null,
  };
  return <ContratosClient d={{ ...data, contratos: largest }} series={series} doors={doors} />;
}
