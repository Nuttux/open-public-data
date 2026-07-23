import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "@/app/fusion.css";

import { findCommuneByAny } from "@/lib/all-communes";
import { getCityOrNull } from "@/lib/cities";
import { getCommuneCapabilities } from "@/lib/commune-capabilities";
import { loadCommuneBudget } from "@/lib/commune-budget";
import { buildLocaleAwareMetadata } from "@/lib/seo";
import CommuneBudgetClient from "./CommuneBudgetClient";

// National tail communes render on demand (the rich top-N cities keep their own
// physical /fr/city/{paris,marseille}/budget routes, which take precedence).
// Per-request data (private bucket) + the locale cookie → render dynamically,
// never statically prerendered (avoids the static→dynamic cookies error).
export const dynamic = "force-dynamic";

const SOURCE_URL =
  "https://data.economie.gouv.fr/explore/dataset/balances-comptables-des-communes-en-2024/";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const commune = findCommuneByAny(slug);
  const nom = commune?.nom ?? slug;
  return buildLocaleAwareMetadata({
    title: `Budget de ${nom} (par nature) â finances locales`,
    description: `Recettes et dÃ©penses de la commune de ${nom} par nature comptable. Source : balances comptables DGFiP (axe nature).`,
    en: {
      title: `${nom} budget (by nature) â local finances`,
      description: `Revenue and spending of ${nom} by accounting nature. Source: DGFiP balance-sheet accounts (nature axis).`,
    },
    path: `/fr/city/${slug}/budget`,
  });
}

type SP = { year?: string };

export default async function CommuneBudgetPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<SP>;
}) {
  const { slug } = await params;
  const sp = await searchParams;

  // Rich cities (Paris/Marseille) own their functional budget pages elsewhere.
  if (getCityOrNull(slug)) notFound();

  // DATA-DERIVED gate â no city list. Renders iff the national budget-by-nature
  // export exists for this commune.
  const caps = getCommuneCapabilities(slug);
  if (!caps.budget.nature) notFound();

  const commune = findCommuneByAny(slug);
  if (!commune) notFound();

  // Budget JSON is fetched server-side from the public bucket (transparent to
  // the visitor â they receive HTML). notFound if the file is missing.
  const requestedYear = sp.year ? Number(sp.year) : undefined;
  const loaded = await loadCommuneBudget(slug, requestedYear);
  if (!loaded) notFound();

  return (
    <CommuneBudgetClient
      commune={{
        slug,
        insee: commune.insee,
        nom: commune.nom,
        dep_name: commune.dep_name,
        reg_name: commune.reg_name,
        pop: commune.pop,
      }}
      data={loaded.data}
      availableYears={loaded.availableYears}
      year={loaded.year}
      hasFonction={caps.budget.fonction}
      sourceUrl={SOURCE_URL}
    />
  );
}
