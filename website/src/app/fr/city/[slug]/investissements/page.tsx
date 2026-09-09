import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import "@/app/fusion.css";

import { findCommuneByAny } from "@/lib/all-communes";
import { hasDedicatedRoutes } from "@/lib/cities";
import { getCommuneCapabilities } from "@/lib/commune-capabilities";
import { loadCommuneInvestissements } from "@/lib/commune-investissements";
import { buildLocaleAwareMetadata } from "@/lib/seo";
import CommuneInvestissementsClient from "./CommuneInvestissementsClient";

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
    title: `Investissements de ${nom} â dÃ©penses d'Ã©quipement`,
    description: `DÃ©penses d'Ã©quipement et financement de l'investissement de ${nom}. Source : balances comptables DGFiP.`,
    en: {
      title: `${nom} investment â capital expenditure`,
      description: `Capital spending and investment financing of ${nom}. Source: DGFiP balance-sheet accounts.`,
    },
    path: `/fr/city/${slug}/investissements`,
  });
}

export default async function CommuneInvestissementsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  // Bloc 2 (2026-09-09) : l'ancien onglet est une section de la page ville.
  if (!hasDedicatedRoutes(slug)) permanentRedirect(`/fr/city/${slug}#construit`);
  // Seules Paris et Marseille ont leurs propres pages ; les autres villes du
  // registre passent par la route nationale comme toute commune.
  if (hasDedicatedRoutes(slug)) notFound();

  const caps = getCommuneCapabilities(slug);
  if (!caps.investissements) notFound();

  const commune = findCommuneByAny(slug);
  if (!commune) notFound();

  const data = await loadCommuneInvestissements(slug);
  if (!data) notFound();

  return (
    <CommuneInvestissementsClient
      commune={{
        slug,
        nom: commune.nom,
        dep_name: commune.dep_name,
        reg_name: commune.reg_name,
        pop: commune.pop,
      }}
      data={data}
      sourceUrl={SOURCE_URL}
    />
  );
}
