import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "@/app/fusion.css";

import { findCommuneByAny } from "@/lib/all-communes";
import { getCityOrNull } from "@/lib/cities";
import { getCommuneCapabilities } from "@/lib/commune-capabilities";
import { loadCommunePeers } from "@/lib/commune-peers";
import { buildLocaleAwareMetadata } from "@/lib/seo";
import ComparaisonClient from "./ComparaisonClient";

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
    title: `${nom} â comparÃ©e aux communes de mÃªme taille`,
    description: `Finances de ${nom} rapportÃ©es Ã  l'habitant, comparÃ©es Ã  la mÃ©diane des communes franÃ§aises de mÃªme strate de population. Source : OFGL.`,
    en: {
      title: `${nom} â compared with similar-sized communes`,
      description: `${nom}'s finances per capita, set against the median of French communes in the same population band. Source: OFGL.`,
    },
    path: `/fr/city/${slug}/comparaison`,
  });
}

export default async function CommuneComparaisonPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (getCityOrNull(slug)) notFound();

  const caps = getCommuneCapabilities(slug);
  if (!caps.comparaison) notFound();

  const commune = findCommuneByAny(slug);
  if (!commune) notFound();

  const data = loadCommunePeers(slug);
  if (!data) notFound();

  return (
    <ComparaisonClient
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
