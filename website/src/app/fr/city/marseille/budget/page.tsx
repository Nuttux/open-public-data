import type { Metadata } from "next";
import "@/app/fusion.css";

import {
  loadBudgetIndex,
  loadBudgetPageData,
  type VoteExecuteData,
} from "@/lib/fusion-data";
import { getPostsForPage } from "@/lib/page-articles";
import { buildLocaleAwareMetadata } from "@/lib/seo";
import BudgetClient from "@/app/fr/city/paris/budget/BudgetClient";

// POC v1 Marseille — réutilise BudgetClient Paris avec data Marseille.
// Le BudgetClient consommera des labels "Budget Marseille" via centralNodeFor()
// dans loadBudgetPageData. Limites POC connues :
//   - Pas de voteExec Marseille (passé comme objet vide)
//   - Pas d'articles dédiés Marseille pour l'instant
//   - Quelques mentions "Paris" peuvent subsister dans BudgetClient (à déparisifier post-POC)

export async function generateMetadata(): Promise<Metadata> {
  return buildLocaleAwareMetadata({
    title: "Le budget de Marseille",
    description:
      "Recettes, dépenses et exécution du budget de la Ville de Marseille. Flux complet, détail par catégorie de flux. Source : comptes administratifs M57 (data.gouv.fr).",
    en: {
      title: "Marseille budget",
      description:
        "Revenue, spending and execution of the Ville de Marseille budget. Full flow, breakdown by flow category. Source: M57 administrative accounts (data.gouv.fr).",
    },
    path: "/fr/city/marseille/budget",
  });
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

  return <BudgetClient index={index} d={d} voteExec={voteExec} posts={posts} />;
}
