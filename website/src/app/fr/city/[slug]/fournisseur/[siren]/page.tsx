import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "@/app/fusion.css";
import { findCommuneByAny } from "@/lib/all-communes";
import { hasDedicatedRoutes } from "@/lib/cities";
import { loadCommuneFournisseurs, loadCommuneMarches } from "@/lib/commune-marches";
import { displayFournisseur } from "@/lib/fournisseur-display";
import { buildLocaleAwareMetadata } from "@/lib/seo";
import FournisseurLocalClient from "./FournisseurLocalClient";

/**
 * Fiche fournisseur locale (bloc 3, 2026-09-10) : ce qu'un fournisseur fait
 * dans CETTE commune, d'abord ; l'empreinte nationale en second niveau. Une
 * personne physique (entrepreneur individuel) n'a jamais de fiche : elle
 * n'est pas dans fournisseurs.json, donc 404.
 */
export const dynamic = "force-dynamic";

const SOURCE_URL = "https://www.data.gouv.fr/fr/datasets/donnees-essentielles-de-la-commande-publique-consolidees-format-tabulaire/";

async function load(slug: string, siren: string) {
  if (hasDedicatedRoutes(slug) || !/^\d{9}$/.test(siren)) return null;
  const commune = findCommuneByAny(slug);
  if (!commune) return null;
  const data = await loadCommuneFournisseurs(slug);
  const f = data?.fournisseurs.find((x) => x.siren === siren);
  if (!data || !f) return null;
  return { commune, data, f };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string; siren: string }> }): Promise<Metadata> {
  const { slug, siren } = await params;
  const r = await load(slug, siren);
  if (!r) notFound();
  const nom = displayFournisseur(r.f.nom);
  const m = r.f.montant >= 1e6 ? `${(r.f.montant / 1e6).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} M€` : `${Math.round(r.f.montant / 1e3).toLocaleString("fr-FR")} k€`;
  return buildLocaleAwareMetadata({
    title: `${nom} à ${r.commune.nom} : ${r.f.nb} marchés publics, ${m}`,
    description: `Ce que ${nom} fait pour la commune de ${r.commune.nom} : les marchés publics notifiés, objets, montants et années. Source DECP.`,
    en: {
      title: `${nom} in ${r.commune.nom}: ${r.f.nb} public contracts, ${m}`,
      description: `What ${nom} does for the town of ${r.commune.nom}: the public contracts awarded, subjects, amounts and years. Source: DECP.`,
    },
    path: `/fr/city/${slug}/fournisseur/${siren}`,
  });
}

export default async function FournisseurLocalPage({ params }: { params: Promise<{ slug: string; siren: string }> }) {
  const { slug, siren } = await params;
  const r = await load(slug, siren);
  if (!r) notFound();
  const marches = await loadCommuneMarches(slug);
  // Les autres fournisseurs de la commune (cinq plus gros, hors celui-ci) :
  // un fournisseur ouvre sur les autres, jamais une impasse.
  const others = r.data.fournisseurs.filter((x) => x.siren !== siren).slice(0, 5).map((x) => ({ siren: x.siren, nom: displayFournisseur(x.nom), montant: x.montant, nb: x.nb }));
  return (
    <FournisseurLocalClient
      commune={{ slug: r.commune.slug, nom: r.commune.nom, dep_name: r.commune.dep_name, pop: r.commune.pop }}
      f={{ ...r.f, nom: displayFournisseur(r.f.nom) }}
      nationalComplet={r.data.national_complet}
      coverageNote={r.data.coverage_note}
      totalCommune={marches?.total.montant ?? null}
      others={others}
      sourceUrl={SOURCE_URL}
    />
  );
}
