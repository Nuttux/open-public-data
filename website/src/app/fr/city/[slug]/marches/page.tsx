import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "@/app/fusion.css";

import { findCommuneByAny } from "@/lib/all-communes";
import { getCityOrNull } from "@/lib/cities";
import { getCommuneCapabilities } from "@/lib/commune-capabilities";
import { loadCommuneMarches } from "@/lib/commune-marches";
import { buildLocaleAwareMetadata } from "@/lib/seo";
import CommuneMarchesClient from "./CommuneMarchesClient";

// Per-request data (private bucket) + the locale cookie → render dynamically,
// never statically prerendered (avoids the static→dynamic cookies error).
export const dynamic = "force-dynamic";

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
    title: `MarchÃ©s publics de ${nom} â commande publique (DECP)`,
    description: `Montants, fournisseurs et domaines des marchÃ©s publics de ${nom}. Source : DECP consolidÃ© (data.gouv.fr).`,
    en: {
      title: `${nom} public procurement â awarded contracts (DECP)`,
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
  if (getCityOrNull(slug)) notFound(); // rich cities own their marchÃ©s page

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
