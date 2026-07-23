import type { Metadata } from "next";
import { loadBudget } from "@/lib/br/recife-data";
import BudgetClient from "./BudgetClient";

export const metadata: Metadata = {
  title: { absolute: "Recife · Orçamento" },
  description:
    "A despesa municipal executada do Recife, por função (saúde, educação, urbanismo), ano a ano — direto dos dados abertos da Prefeitura.",
};

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
