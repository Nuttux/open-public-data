import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import "@/app/fusion.css";
import BudgetClient from "@/app/[lang]/brasil/recife/budget/BudgetClient";
import { findMunicipio, loadMunicipioBudget, municipioPeers } from "@/lib/br/municipios";
import { fmtBrlCompact } from "@/lib/br/format";
import { sectionAlternates } from "@/lib/seo/page-answer";
import { recifeLocale } from "@/lib/br/recife-locale";

// Every Brazilian município (2026-09-18): the same page as Recife's budget,
// read from the SICONFI annual accounts. Recife keeps its own routes
// (/brasil/recife, a static segment, wins over this one).

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const m = findMunicipio(slug);
  if (!m) return { title: "Qipu" };
  const locale = await recifeLocale();
  const y = m.anos[m.anos.length - 1];
  const total = fmtBrlCompact(m.pago);
  const hab = m.hab ? ` · R$ ${m.hab.toLocaleString(locale === "en" ? "en-US" : "pt-BR")} ${locale === "en" ? "per resident" : "por habitante"}` : "";
  const meta =
    locale === "en"
      ? { title: `${m.nome} (${m.uf}) budget: ${total} paid in ${y}`, description: `What the município of ${m.nome} (${m.uf}) spent in ${y}, function by function, year by year${hab}. Source: SICONFI, Tesouro Nacional.` }
      : { title: `Orçamento de ${m.nome} (${m.uf}): ${total} pagos em ${y}`, description: `O que o município de ${m.nome} (${m.uf}) gastou em ${y}, função por função, ano a ano${hab}. Fonte: SICONFI, Tesouro Nacional.` };
  return { ...meta, ...sectionAlternates(`/brasil/${slug}`, locale) };
}

export default async function MunicipioPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ year?: string }> }) {
  const { slug } = await params;
  // Recife has its own pages, fed by the Ville's data : its SICONFI page is not a second one.
  if (slug === "recife-pe") redirect(`/${await recifeLocale()}/brasil/recife`);
  const m = findMunicipio(slug);
  if (!m) notFound();
  const d = await loadMunicipioBudget(m.id);
  if (!d) notFound();
  const sp = await searchParams;
  const ano = sp.year ? parseInt(sp.year, 10) : undefined;
  const peers = municipioPeers(slug).map((p) => ({ slug: p.slug, nome: p.nome, uf: p.uf, pop: p.pop as number, hab: p.hab as number, ano: p.anos[p.anos.length - 1] }));
  return (
    <BudgetClient
      d={d}
      ano={ano}
      city={{ slug, name: `${m.nome} (${m.uf})`, shortName: m.nome, base: `/brasil/${slug}`, hub: "/brasil", drawers: true, peers }}
    />
  );
}
