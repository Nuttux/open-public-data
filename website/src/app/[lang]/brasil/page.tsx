import type { Metadata } from "next";
import "@/app/fusion.css";
import BrasilHubClient, { type BrasilHubData } from "./BrasilHubClient";
import { listMunicipios } from "@/lib/br/municipios";
import { loadBudget } from "@/lib/br/recife-data";
import { fmtBrlCompact } from "@/lib/br/format";
import { sectionAlternates } from "@/lib/seo/page-answer";
import { recifeLocale } from "@/lib/br/recife-locale";

/**
 * /pt/brasil, /en/brasil (2026-09-18): the Brazil hub. A field to find one's
 * município among the 5 570, the country's number, Recife as the documented
 * city, the 27 capitals as a way in. Used to redirect to Recife.
 */

function hubData(): BrasilHubData {
  const all = listMunicipios();
  const year = Math.max(...all.map((m) => m.anos[m.anos.length - 1]));
  const inYear = all.filter((m) => m.anos[m.anos.length - 1] === year);
  const totalPago = inYear.reduce((s, m) => s + m.pago, 0);
  const capitals = all.filter((m) => m.cap).map((m) => ({ slug: m.slug, nome: m.nome, uf: m.uf, pop: m.pop, hab: m.hab, ano: m.anos[m.anos.length - 1] }));
  let recife: BrasilHubData["recife"] = null;
  try {
    const b = loadBudget();
    const y = b.partial_year ? b.partial_year.ano - 1 : b.ano_mais_recente;
    const a = b.anos.find((x) => x.ano === y);
    if (a) recife = { total: a.total_pago, year: a.ano };
  } catch { /* Recife's file missing : no figure on the door */ }
  return { count: all.length, year, totalPago, capitals, recife };
}

export async function generateMetadata(): Promise<Metadata> {
  const locale = await recifeLocale();
  const d = hubData();
  const n = d.count.toLocaleString(locale === "en" ? "en-US" : "pt-BR");
  const meta =
    locale === "en"
      ? { title: `Brazil: where public money goes in each of ${n} municípios`, description: `Every Brazilian município has its page: what it spent in ${d.year} (${fmtBrlCompact(d.totalPago)} in all), function by function, per resident, against municípios of the same size. Recife in detail. Source: SICONFI, National Treasury.` }
      : { title: `Brasil: para onde vai o dinheiro público de cada um dos ${n} municípios`, description: `Cada município brasileiro tem a sua página: o que gastou em ${d.year} (${fmtBrlCompact(d.totalPago)} no total), função por função, por habitante, frente aos municípios do mesmo tamanho. Recife em detalhe. Fonte: SICONFI, Tesouro Nacional.` };
  return { ...meta, ...sectionAlternates("/brasil", locale) };
}

export default function BrasilHub() {
  return <BrasilHubClient d={hubData()} />;
}
