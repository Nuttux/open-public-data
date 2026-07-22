import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "@/app/fusion.css";

import { findCommuneByAny } from "@/lib/all-communes";
import { getCityOrNull } from "@/lib/cities";
import { getCommuneCapabilities } from "@/lib/commune-capabilities";
import { loadCommuneInvestissements } from "@/lib/commune-investissements";
import { buildLocaleAwareMetadata } from "@/lib/seo";
import CommuneInvestissementsClient from "./CommuneInvestissementsClient";

export const dynamicParams = true;
export function generateStaticParams(): { slug: string }[] {
  return [];
}

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
    title: `Investissements de ${nom} — dépenses d'équipement`,
    description: `Dépenses d'équipement et financement de l'investissement de ${nom}. Source : balances comptables DGFiP.`,
    en: {
      title: `${nom} investment — capital expenditure`,
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
  if (getCityOrNull(slug)) notFound();

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
