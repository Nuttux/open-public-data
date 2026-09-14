import { permanentRedirectLocalized } from "@/lib/redirect-server";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "@/app/fusion.css";

import { findCommuneByAny } from "@/lib/all-communes";
import { hasDedicatedRoutes } from "@/lib/cities";
import { getCommuneCapabilities } from "@/lib/commune-capabilities";
import { loadCommuneEvolution } from "@/lib/commune-evolution";
import { buildLocaleAwareMetadata } from "@/lib/seo";
import { deNom } from "@/lib/nom-commune";
import CommuneEvolutionClient from "./CommuneEvolutionClient";

// Per-request data (private bucket) + the locale cookie → render dynamically,
// never statically prerendered (avoids the static→dynamic cookies error).
export const dynamic = "force-dynamic";

const SOURCE_URL = "https://data.ofgl.fr/explore/dataset/ofgl-base-communes-consolidee/";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const commune = findCommuneByAny(slug);
  const nom = commune?.nom ?? slug;
  return buildLocaleAwareMetadata({
    title: `${nom} — évolution des finances (7 ans)`,
    description: `Trajectoire financière ${deNom(nom)} sur 7 ans : dépenses, recettes, dette. Source : OFGL.`,
    en: {
      title: `${nom} — finances over time (7 years)`,
      description: `${nom}'s financial trajectory over 7 years: spending, revenue, debt. Source: OFGL.`,
    },
    path: `/france/${slug}/evolution`,
  });
}

export default async function CommuneEvolutionPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  // Bloc 2 (2026-09-09) : l'ancien onglet est une section de la page ville.
  if (!hasDedicatedRoutes(slug)) await permanentRedirectLocalized(`/france/${slug}#dette`);
  // Seules Paris et Marseille ont leurs propres pages ; les autres villes du
  // registre passent par la route nationale comme toute commune.
  if (hasDedicatedRoutes(slug)) notFound();

  const caps = getCommuneCapabilities(slug);
  if (!caps.evolution) notFound();

  const commune = findCommuneByAny(slug);
  if (!commune) notFound();

  const data = await loadCommuneEvolution(slug);
  if (!data) notFound();

  return (
    <CommuneEvolutionClient
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
