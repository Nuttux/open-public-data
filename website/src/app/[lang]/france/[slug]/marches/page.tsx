import { permanentRedirectLocalized } from "@/lib/redirect-server";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MARCHES_EXPLORER_MIN } from "../page-ville-data";
import { marchesManifestCount } from "@/lib/commune-marches";
import "@/app/fusion.css";

import { findCommuneByAny } from "@/lib/all-communes";
import { hasDedicatedRoutes } from "@/lib/cities";
import { getCommuneCapabilities } from "@/lib/commune-capabilities";
import { loadCommuneFournisseurs, loadCommuneMarches } from "@/lib/commune-marches";
import CommuneMarchesClient from "./CommuneMarchesClient";
import { communeMarchesMetadata, DECP_SOURCE_URL } from "./marches-metadata";

// Per-request data (private bucket) + the locale cookie → render dynamically,
// never statically prerendered (avoids the static→dynamic cookies error).
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const commune = findCommuneByAny(slug);
  return communeMarchesMetadata(slug, commune?.nom ?? slug);
}

export default async function CommuneMarchesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  // Bloc 2 (2026-09-09) : l'explorateur ne reste que quand la section de la
  // page ville déborde (plus de 50 marchés) ; sinon l'ancre suffit.
  if (!hasDedicatedRoutes(slug)) {
    const nb = marchesManifestCount(slug);
    if (nb <= MARCHES_EXPLORER_MIN) await permanentRedirectLocalized(`/france/${slug}#achats`);
  }
  // Seules Paris et Marseille ont leurs propres pages ; les autres villes du
  // registre passent par la route nationale comme toute commune.
  if (hasDedicatedRoutes(slug)) notFound();

  const caps = getCommuneCapabilities(slug);
  if (!caps.marches) notFound();

  const commune = findCommuneByAny(slug);
  if (!commune) notFound();

  const data = await loadCommuneMarches(slug);
  if (!data) notFound();
  const fournisseurs = await loadCommuneFournisseurs(slug);

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
      fournisseurs={fournisseurs}
      sourceUrl={DECP_SOURCE_URL}
    />
  );
}
