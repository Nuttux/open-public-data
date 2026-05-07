import type { Metadata } from "next";
import "@/app/fusion.css";

import {
  loadBudgetIndex,
  loadBudgetPageData,
} from "@/lib/fusion-data";
import { buildLocaleAwareMetadata } from "@/lib/seo";
import BudgetClient from "@/app/ville/paris/budget/BudgetClient";

// POC v1 Marseille — réutilise BudgetClient Paris avec data Marseille.
// Le BudgetClient consommera des labels "Budget Marseille" via centralNodeFor()
// dans loadBudgetPageData. Limites POC connues :
//   - Pas de voteExec Marseille (passé comme objet vide)
//   - Pas d'articles dédiés Marseille pour l'instant
//   - Quelques mentions "Paris" peuvent subsister dans BudgetClient (à déparisifier post-POC)

export async function generateMetadata(): Promise<Metadata> {
  return buildLocaleAwareMetadata({
    title: "Le budget de Marseille — France Open Data",
    description:
      "Recettes, dépenses et exécution du budget de la Ville de Marseille. Flux complet, détail par catégorie de flux. Source : comptes administratifs M57 (data.gouv.fr).",
    en: {
      title: "Marseille budget — France Open Data",
      description:
        "Revenue, spending and execution of the Ville de Marseille budget. Full flow, breakdown by flow category. Source: M57 administrative accounts (data.gouv.fr).",
    },
    path: "/ville/marseille/budget",
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
  // No voteExec data for Marseille (Paris-specific BP/CA reconciliation not
  // built yet — Marseille publishes BP and CA but with different schemas, so
  // the rapprochement view will come in a later iteration).
  const voteExec = {
    comparisonYears: [],
    forecastYears: index.availableYears ?? [],
    rows: [],
    topEcarts: [],
  };
  // No Marseille-specific blog posts yet — empty list so RelatedArticles
  // section is hidden (BudgetClient gates the render on posts.length).
  // Filter by city tag will come once Marseille articles are written.
  const posts: Parameters<typeof BudgetClient>[0]["posts"] = [];

  return <BudgetClient index={index} d={d} voteExec={voteExec} posts={posts} />;
}
