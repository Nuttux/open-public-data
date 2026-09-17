import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "@/app/fusion.css";

import { findCommuneByAny } from "@/lib/all-communes";
import { getCommuneCapabilities } from "@/lib/commune-capabilities";
import { loadCommuneFournisseurs, loadCommuneMarches } from "@/lib/commune-marches";
import CommuneMarchesClient from "@/app/[lang]/france/[slug]/marches/CommuneMarchesClient";
import { communeMarchesMetadata, DECP_SOURCE_URL } from "@/app/[lang]/france/[slug]/marches/marches-metadata";

// Marseille marchés (2026-09-17) : the same explorer as every commune, on the
// national DECP file (2020 to today), at the address the city already had.
// The Ville's own file on data.gouv.fr stops in 2020 ; its contract and
// supplier pages under marches/contrat and marches/fournisseur stay reachable
// by their addresses.

export const dynamic = "force-dynamic";

const SLUG = "marseille";

export async function generateMetadata(): Promise<Metadata> {
  const commune = findCommuneByAny(SLUG);
  return communeMarchesMetadata(SLUG, commune?.nom ?? "Marseille");
}

export default async function MarseilleMarchesPage() {
  const caps = getCommuneCapabilities(SLUG);
  if (!caps.marches) notFound();
  const commune = findCommuneByAny(SLUG);
  if (!commune) notFound();
  const data = await loadCommuneMarches(SLUG);
  if (!data) notFound();
  const fournisseurs = await loadCommuneFournisseurs(SLUG);
  return (
    <CommuneMarchesClient
      commune={{ slug: SLUG, nom: commune.nom, dep_name: commune.dep_name, reg_name: commune.reg_name, pop: commune.pop }}
      data={data}
      fournisseurs={fournisseurs}
      sourceUrl={DECP_SOURCE_URL}
    />
  );
}
