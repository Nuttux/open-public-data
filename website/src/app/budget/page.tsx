import type { Metadata } from "next";
import "../fusion.css";

import {
  loadBudgetIndex,
  loadBudgetPageData,
  loadVoteExecute,
} from "@/lib/fusion-data";
import { getPostsForPage } from "@/lib/page-articles";
import { buildLocaleAwareMetadata } from "@/lib/seo";
import BudgetClient from "./BudgetClient";

export async function generateMetadata(): Promise<Metadata> {
  return buildLocaleAwareMetadata({
    title: "Le budget de Paris — France Open Data",
    description:
      "Recettes, dépenses et exécution du budget de la Ville de Paris. Flux complet, détail par thématique, évolution 2019-2026. Source : comptes administratifs M57.",
    en: {
      title: "Paris budget — France Open Data",
      description:
        "Revenue, spending and execution of the Ville de Paris budget. Full flow, breakdown by theme, 2019–2026 trend. Source: M57 administrative accounts.",
    },
    path: "/budget",
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
  const index = loadBudgetIndex();
  const d = loadBudgetPageData(requestedYear);
  const voteExec = loadVoteExecute();
  const posts = getPostsForPage("budget");

  return <BudgetClient index={index} d={d} voteExec={voteExec} posts={posts} />;
}
