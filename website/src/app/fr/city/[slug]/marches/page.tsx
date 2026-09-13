import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { MARCHES_EXPLORER_MIN } from "../page-ville-data";
import { marchesManifestCount, marchesManifestEntry } from "@/lib/commune-marches";
import { deNom } from "@/lib/nom-commune";
import "@/app/fusion.css";

import { findCommuneByAny } from "@/lib/all-communes";
import { hasDedicatedRoutes } from "@/lib/cities";
import { getCommuneCapabilities } from "@/lib/commune-capabilities";
import { loadCommuneFournisseurs, loadCommuneMarches } from "@/lib/commune-marches";
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
  const path = `/fr/city/${slug}/marches`;
  // Le titre répond avec les chiffres de l'en-tête de la page : le manifeste
  // engagé porte le même total, sans lire le bucket pour la balise <title>.
  const m = marchesManifestEntry(slug);
  // Une série finie depuis plus de deux ans ne va pas dans le titre (voir
  // lib/seo/sections/marseille.ts, isRecent) : titre descriptif, sans chiffre.
  if (!m || m.nb === 0 || m.years.length === 0 || Math.max(...m.years) < new Date().getFullYear() - 2) {
    return buildLocaleAwareMetadata({
      title: `Les marchés publics ${deNom(nom)}`,
      description: `Montants, fournisseurs et domaines des marchés publics ${deNom(nom)}. Source : DECP consolidé (data.gouv.fr).`,
      en: {
        title: `The public contracts of ${nom}`,
        description: `Amounts, suppliers and categories of ${nom}'s public contracts. Source: consolidated DECP (data.gouv.fr).`,
      },
      path,
    });
  }
  const y0 = Math.min(...m.years);
  const y1 = Math.max(...m.years);
  // Même arrondi que l'en-tête (CommuneMarchesClient, split()).
  const amount = (tag: string) => {
    const a = Math.abs(m.montant);
    if (a >= 1e9) return `${(m.montant / 1e9).toLocaleString(tag, { maximumFractionDigits: 2 })} Md€`;
    if (a >= 1e6) return `${(m.montant / 1e6).toLocaleString(tag, { maximumFractionDigits: a >= 1e8 ? 0 : 1 })} M€`;
    return `${Math.round(m.montant / 1e3).toLocaleString(tag)} k€`;
  };
  const nbFr = m.nb.toLocaleString("fr-FR");
  const nbEn = m.nb.toLocaleString("en-GB");
  return buildLocaleAwareMetadata({
    title: `Marchés publics ${deNom(nom)} : ${nbFr} marchés, ${amount("fr-FR")}`,
    description: `${nom} a notifié ${nbFr} marchés publics de ${y0} à ${y1}, pour ${amount("fr-FR")} de contrats : fournisseurs, domaines et montants, année par année. Source : DECP consolidé (data.gouv.fr).`,
    en: {
      title: `${nom} public contracts: ${nbEn} awarded, ${amount("en-GB")}`,
      description: `${nom} awarded ${nbEn} public contracts from ${y0} to ${y1}, worth ${amount("en-GB")}: suppliers, categories and amounts, year by year. Source: consolidated DECP (data.gouv.fr).`,
    },
    path,
  });
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
    if (nb <= MARCHES_EXPLORER_MIN) permanentRedirect(`/fr/city/${slug}#achats`);
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
      sourceUrl={SOURCE_URL}
    />
  );
}
