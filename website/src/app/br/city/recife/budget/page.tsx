import type { Metadata } from "next";
import { loadBudget } from "@/lib/br/recife-data";
import BudgetClient from "./BudgetClient";
import { sectionAlternates } from "@/lib/seo/page-answer";
import { recifeLocale } from "@/lib/br/recife-locale";

const META_PT = { title: "Recife — Orçamento", description: "A despesa municipal executada do Recife, por função (saúde, educação, urbanismo), ano a ano — direto dos dados abertos da Prefeitura." };
const META_EN = { title: "Recife — Budget", description: "Recife's executed municipal spending by function (health, education, urban planning), year by year, straight from the City's open data." };

// Portuguese on pt.qipu.org, English on www — with the canonical and hreflang
// of the host answering (lib/site-locale.ts).
export async function generateMetadata(): Promise<Metadata> {
  const locale = await recifeLocale();
  return { ...(locale === "en" ? META_EN : META_PT), ...sectionAlternates("/br/city/recife/budget", locale) };
}

export default async function RecifeBudgetPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const d = loadBudget();
  const sp = await searchParams;
  const ano = sp.year ? parseInt(sp.year, 10) : undefined;
  return <BudgetClient d={d} ano={ano} />;
}
