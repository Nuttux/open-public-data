import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "@/app/fusion.css";

import { findCommuneByAny } from "@/lib/all-communes";
import { getCityOrNull } from "@/lib/cities";
import { getCommuneCapabilities } from "@/lib/commune-capabilities";
import { loadCommuneMarches } from "@/lib/commune-marches";
import { buildLocaleAwareMetadata } from "@/lib/seo";
import CommuneMarchesClient from "./CommuneMarchesClient";

export const dynamicParams = true;
export function generateStaticParams(): { slug: string }[] {
  return [];
}

const SOURCE_URL =
  "https://www.data.gouv.fr/fr/datasets/donnees-essentielles-de-la-commande-publique-consolidees-format-tabulaire/";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const commune = findCommuneByAny(slug);
  const nom = commune?.nom ?? slug;
  return buildLocaleAwareMetadata({
    title: `Marchés publics de ${nom} — commande publique (DECP)`,
    description: `Montants, fournisseurs et domaines des marchés publics de ${nom}. Source : DECP consolidé (data.gouv.fr).`,
    en: {
      title: `${nom} public procurement — awarded contracts (DECP)`,
      description: `Amounts, suppliers and categories of ${nom} public contracts. Source: consolidated DECP (data.gouv.fr).`,
    },
    path: `/fr/city/${slug}/marches`,
  });
}

export default async function CommuneMarchesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (getCityOrNull(slug)) notFound(); // rich cities own their marchés page

  const caps = getCommuneCapabilities(slug);
  if (!caps.marches) notFound();

  const commune = findCommuneByAny(slug);
  if (!commune) notFound();

  const data = await loadCommuneMarches(slug);
  if (!data) notFound();

  return (
    <CommuneMarchesClient
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
