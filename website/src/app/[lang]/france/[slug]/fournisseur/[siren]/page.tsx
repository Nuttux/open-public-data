import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "@/app/fusion.css";
import { buildLocaleAwareMetadata } from "@/lib/seo";
import FournisseurLocalClient from "./FournisseurLocalClient";
import { loadFournisseurLocal, SOURCE_URL } from "./load";

/**
 * Fiche fournisseur locale (bloc 3, 2026-09-10) : ce qu'un fournisseur fait
 * dans CETTE commune, d'abord ; l'empreinte nationale en second niveau. Depuis
 * la page ville, elle s'ouvre en drawer (route interceptée sous @drawer, comme
 * à Paris) ; en accès direct, c'est cette page pleine.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string; siren: string }> }): Promise<Metadata> {
  const { slug, siren } = await params;
  const r = await loadFournisseurLocal(slug, siren);
  if (!r) notFound();
  const nom = r.f.nom;
  const m = r.f.montant >= 1e6 ? `${(r.f.montant / 1e6).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} M€` : `${Math.round(r.f.montant / 1e3).toLocaleString("fr-FR")} k€`;
  return buildLocaleAwareMetadata({
    title: `${nom} à ${r.commune.nom} : ${r.f.nb} marchés publics, ${m}`,
    description: `Ce que ${nom} fait pour la commune de ${r.commune.nom} : les marchés publics notifiés, objets, montants et années. Source DECP.`,
    en: {
      title: `${nom} in ${r.commune.nom}: ${r.f.nb} public contracts, ${m}`,
      description: `What ${nom} does for the town of ${r.commune.nom}: the public contracts awarded, subjects, amounts and years. Source: DECP.`,
    },
    path: `/france/${slug}/fournisseur/${siren}`,
  });
}

export default async function FournisseurLocalPage({ params }: { params: Promise<{ slug: string; siren: string }> }) {
  const { slug, siren } = await params;
  const r = await loadFournisseurLocal(slug, siren);
  if (!r) notFound();
  return <FournisseurLocalClient {...r} sourceUrl={SOURCE_URL} />;
}
