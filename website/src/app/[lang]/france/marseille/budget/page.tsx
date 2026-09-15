import type { Metadata } from "next";
import "@/app/fusion.css";

import {
  loadBudgetIndex,
  loadBudgetPageData,
  marchesDoorTotal,
  subventionsYearTotal,
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
  const posts = getPostsForPage("budget");
  // The doors carry the numbers the city publishes; none of the rest (no photo, no investment total).
  const safe = <T,>(f: () => T): T | null => { try { return f(); } catch { return null; } };
  const doors = {
    marches: safe(() => marchesDoorTotal("marseille", d.year)),
    subventions: safe(() => subventionsYearTotal("marseille", d.year)),
    invest: null,
  };

  const locale = await readLocale();
  return (
    <>
      <FrHubJsonLd hub={marseilleBudgetHub()} locale={locale} />
      <BudgetClient index={index} d={d} posts={posts} doors={doors} photo={null} />
    </>
  );
}
