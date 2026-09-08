import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "@/app/fusion.css";

import { findCommuneByAny } from "@/lib/all-communes";
import { hasDedicatedRoutes } from "@/lib/cities";
import { getCommuneCapabilities } from "@/lib/commune-capabilities";
import { loadCommuneBudget } from "@/lib/commune-budget";
import { buildLocaleAwareMetadata } from "@/lib/seo";
import CommuneBudgetClient from "./CommuneBudgetClient";
import { readLocale } from "@/lib/seo";
import { listAllCommunesMeta } from "@/lib/all-communes";
import type { RelatedBlock, RelatedRow } from "@/components/fiche/RelatedLinks";

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
  // Same gates as the page, thrown before streaming so the status is a real 404.
  if (!commune || hasDedicatedRoutes(slug) || !getCommuneCapabilities(slug).budget.nature) notFound();
  const nom = commune.nom;
  const dep = commune?.dep_name ? ` (${commune.dep_name})` : "";
  return buildLocaleAwareMetadata({
    title: `Budget de ${nom}${dep} : recettes, dépenses et dette de la commune`,
    description: `Combien ${nom} dépense et encaisse chaque année, poste par poste, et ce que la commune doit. Source : balances comptables des communes, DGFiP (axe nature).`,
    en: {
      title: `${nom}${dep} budget: the town's revenue, spending and debt`,
      description: `How much ${nom} spends and collects each year, item by item, and what the town owes. Source: DGFiP municipal accounts (nature axis).`,
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
  // Seules Paris et Marseille ont leurs propres pages ; les autres villes du
  // registre passent par la route nationale comme toute commune.
  if (hasDedicatedRoutes(slug)) notFound();

  // DATA-DERIVED gate — no city list. Renders iff the national budget-by-nature
  // export exists for this commune.
  const caps = getCommuneCapabilities(slug);
  if (!caps.budget.nature) notFound();

  const commune = findCommuneByAny(slug);
  if (!commune) notFound();

  // Budget JSON is fetched server-side from the public bucket (transparent to
  // the visitor — they receive HTML). notFound if the file is missing.
  const requestedYear = sp.year ? Number(sp.year) : undefined;
  const loaded = await loadCommuneBudget(slug, requestedYear);
  if (!loaded) notFound();

  // « Voir aussi » : les autres pages de cette commune (selon ses données) et
  // les communes du même département qui ont un budget publié — jamais un lien
  // vers une page qui n'existe pas.
  const locale = await readLocale();
  const en = locale === "en";
  const pages: RelatedRow[] = [
    { href: `/fr/city/${slug}`, label: en ? `${commune.nom}: budget, debt and taxes` : `${commune.nom} : budget, dette et fiscalité`, sub: en ? "The town's page" : "La fiche de la commune" },
    ...(caps.comparaison ? [{ href: `/fr/city/${slug}/comparaison`, label: en ? "Compared with towns of the same size" : "Comparée aux communes de même taille", sub: en ? "OFGL strata" : "Strate OFGL" }] : []),
    ...(caps.evolution ? [{ href: `/fr/city/${slug}/evolution`, label: en ? "Year by year since 2014" : "Année par année depuis 2014", sub: en ? "Revenue, spending, debt" : "Recettes, dépenses, dette" }] : []),
    ...(caps.investissements ? [{ href: `/fr/city/${slug}/investissements`, label: en ? "What the town invests in" : "Ce que la commune investit", sub: en ? "Investment section" : "Section d'investissement" }] : []),
    ...(caps.marches ? [{ href: `/fr/city/${slug}/marches`, label: en ? "The town's public contracts" : "Les marchés publics de la commune", sub: en ? "Contracts of €40k and above (DECP)" : "Marchés de 40 k€ et plus (DECP)" }] : []),
  ];
  const neighbours: RelatedRow[] = listAllCommunesMeta()
    .filter((c) => c.dep_name === commune.dep_name && c.slug !== slug && !hasDedicatedRoutes(c.slug))
    .sort((a, b) => b.pop - a.pop)
    .filter((c) => getCommuneCapabilities(c.slug).budget.nature)
    .slice(0, 6)
    .map((c) => ({
      href: `/fr/city/${c.slug}/budget`,
      label: en ? `Budget of ${c.nom}` : `Budget de ${c.nom}`,
      sub: en ? `${c.pop.toLocaleString("en-GB")} inhabitants, ${c.dep_name}` : `${c.pop.toLocaleString("fr-FR")} habitants, ${c.dep_name}`,
    }));
  const related: RelatedBlock = {
    title: en ? "See also" : "Voir aussi",
    sub: en ? `The rest of ${commune.nom}'s pages, and the other towns of ${commune.dep_name} with a published budget.` : `Les autres pages de ${commune.nom}, et les autres communes de ${commune.dep_name} au budget publié.`,
    rows: [...pages, ...neighbours],
  };

  return (
    <CommuneBudgetClient
      related={related}
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
