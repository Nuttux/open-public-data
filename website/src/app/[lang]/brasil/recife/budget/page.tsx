import type { Metadata } from "next";
import { loadBudget, loadContratos, loadQuemRecebe } from "@/lib/br/recife-data";
import { loadEnrichedPlacesFile } from "@/lib/br/recife-places-data";
import BudgetClient, { type RecifeBudgetDoors } from "./BudgetClient";
import { sectionAlternates } from "@/lib/seo/page-answer";
import { fmtBrlCompact } from "@/lib/br/format";
import { recifeLocale } from "@/lib/br/recife-locale";

const META_PT = { title: "Recife — Orçamento", description: "A despesa municipal executada do Recife, por função (saúde, educação, urbanismo), ano a ano — direto dos dados abertos da Prefeitura." };
const META_EN = { title: "Recife — Budget", description: "Recife's executed municipal spending by function (health, education, urban planning), year by year, straight from the City's open data." };

// Portuguese on pt.qipu.org, English on www — with the canonical and hreflang
// of the host answering (lib/site-locale.ts).
export async function generateMetadata(): Promise<Metadata> {
  const locale = await recifeLocale();
  // The title carries the number the page opens on : the last complete year, paid.
  const d = loadBudget();
  const complete = d.anos_disponiveis.filter((y) => d.curva_mensal.some((c) => c.ano === y && c.mes === 12));
  const y = complete.length ? Math.max(...complete) : d.ano_mais_recente;
  const total = fmtBrlCompact(d.anos.find((a) => a.ano === y)?.total_pago ?? 0);
  const title = locale === "en" ? `Recife budget ${y}: ${total} paid`: `Orçamento do Recife ${y}: ${total} pagos`;
  return { ...(locale === "en" ? META_EN: META_PT), title, ...sectionAlternates("/brasil/recife/budget", locale) };
}

export default async function RecifeBudgetPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const d = loadBudget();
  const sp = await searchParams;
  const ano = sp.year ? parseInt(sp.year, 10) : undefined;
  // The doors carry the other sections' figures (See also, next section).
  const safe = <T,>(f: () => T): T | null => { try { return f(); } catch { return null; } };
  const qr = safe(() => loadQuemRecebe());
  const ct = safe(() => loadContratos());
  const pl = safe(() => loadEnrichedPlacesFile());
  const doors: RecifeBudgetDoors = {
    quem: qr ? { total: qr.headline.total_pago, n: qr.headline.n_organizacoes, y0: Math.min(...qr.anos_disponiveis), y1: Math.max(...qr.anos_disponiveis) } : null,
    contratos: ct ? { ativos: ct.headline.n_ativos, valor: ct.headline.valor_ativo_total } : null,
    lugares: pl ? { n: pl.places.length, total: pl.places.reduce((s, x) => s + (x.obras_total ?? 0), 0) } : null,
  };
  return <BudgetClient d={d} ano={ano} doors={doors} />;
}
