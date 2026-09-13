import type { Metadata } from "next";
import "@/app/fusion.css";

import {
  loadBudgetIndex,
  loadBudgetPageData,
  type VoteExecuteData,
} from "@/lib/fusion-data";
import { getPostsForPage } from "@/lib/page-articles";
import { buildLocaleAwareMetadata, readLocale } from "@/lib/seo";
import { FrHubJsonLd, hubMetadataInput } from "@/lib/seo/sections/national";
import { marseilleBudgetHub } from "@/lib/seo/sections/marseille";
import BudgetClient from "@/app/[lang]/france/paris/budget/BudgetClient";

// POC v1 Marseille — réutilise BudgetClient Paris avec data Marseille.
// Le BudgetClient consommera des labels "Budget Marseille" via centralNodeFor()
// dans loadBudgetPageData. Limites POC connues :
//   - Pas de voteExec Marseille (passé comme objet vide)
//   - Pas d'articles dédiés Marseille pour l'instant
//   - Quelques mentions "Paris" peuvent subsister dans BudgetClient (à déparisifier post-POC)

export async function generateMetadata(): Promise<Metadata> {
  return buildLocaleAwareMetadata(hubMetadataInput(marseilleBudgetHub()));
}

type SP = { year?: string };

export default async function BudgetPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const requestedYear = sp.year ? Number(sp.year) : undefined;
  const index = loadBudgetIndex("marseille");
  const d = loadBudgetPageData(requestedYear, "marseille");
  // No voteExec data for Marseille (Paris-specific reconciliation not built yet).
  // Empty stub matching the real shape — BudgetClient renders the EmptyState
  // branch when rows is empty (no execution data available).
  const voteExec: VoteExecuteData = {
    comparisonYears: [],
    forecastYears: [],
    rows: [],
    topEcarts: [],
  };
  const posts = getPostsForPage("budget");

  const locale = await readLocale();
  return (
    <>
      <FrHubJsonLd hub={marseilleBudgetHub()} locale={locale} />
      <BudgetClient index={index} d={d} voteExec={voteExec} posts={posts} />
    </>
  );
}
