import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "@/app/fusion.css";
import CompararClient, { type CmpData, type CmpSide } from "./CompararClient";
import { findMunicipio, loadMunicipioBudget } from "@/lib/br/municipios";
import { recifeLocale } from "@/lib/br/recife-locale";
import type { BudgetData } from "@/lib/br/recife-data";

// Two municípios side by side, per resident (2026-09-18) : ?a=olinda-pe&b=caruaru-pe.
// Without b, the page asks for it. Not indexed : every pair is a page.

export const dynamic = "force-dynamic";

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ a?: string; b?: string }> }): Promise<Metadata> {
  const sp = await searchParams;
  const a = sp.a ? findMunicipio(sp.a) : null;
  const b = sp.b ? findMunicipio(sp.b) : null;
  const locale = await recifeLocale();
  const title = a && b
    ? (locale === "en" ? `${a.nome} (${a.uf}) and ${b.nome} (${b.uf}), side by side` : `${a.nome} (${a.uf}) e ${b.nome} (${b.uf}), lado a lado`)
    : (locale === "en" ? "Compare two municípios" : "Comparar dois municípios");
  return { title, robots: { index: false, follow: true } };
}

function side(m: NonNullable<ReturnType<typeof findMunicipio>>, d: BudgetData, year: number): CmpSide | null {
  const y = d.anos.find((x) => x.ano === year);
  if (!y || !d.populacao?.populacao) return null;
  return {
    slug: m.slug,
    nome: m.nome,
    uf: m.uf,
    pop: d.populacao.populacao,
    popAno: d.populacao.ano,
    pago: y.total_pago,
    receita: d.receitas?.find((r) => r.ano === year)?.liquida ?? null,
    funcoes: y.funcoes.filter((f) => f.pago > 0).map((f) => ({ funcao: f.funcao, pago: f.pago })),
  };
}

export default async function CompararPage({ searchParams }: { searchParams: Promise<{ a?: string; b?: string }> }) {
  const sp = await searchParams;
  const a = sp.a ? findMunicipio(sp.a) : null;
  if (!a) notFound();
  const b = sp.b ? findMunicipio(sp.b) : null;
  const da = await loadMunicipioBudget(a.id);
  if (!da) notFound();
  if (!b || b.slug === a.slug) {
    // The second município is missing : the page is the field to pick it.
    const year = da.ano_mais_recente;
    const sa = side(a, da, year);
    if (!sa) notFound();
    return <CompararClient d={{ a: sa, b: sa, year }} pickOnly />;
  }
  const db = await loadMunicipioBudget(b.id);
  if (!db) notFound();
  const common = da.anos.filter((x) => x.total_pago > 0 && db.anos.some((y) => y.ano === x.ano && y.total_pago > 0)).map((x) => x.ano);
  if (common.length === 0) notFound();
  const year = Math.max(...common);
  const sa = side(a, da, year);
  const sb = side(b, db, year);
  if (!sa || !sb) notFound();
  const d: CmpData = { a: sa, b: sb, year };
  return <CompararClient d={d} />;
}
