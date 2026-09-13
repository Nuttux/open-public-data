import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "@/app/fusion.css";
import { findCommuneByAny, loadAllCommunesIndex, loadAllCommunesYear } from "@/lib/all-communes";
import { buildLocaleAwareMetadata } from "@/lib/seo";
import { loadTaux } from "@/lib/commune-taux";
import { pilotPair } from "@/lib/compare-pairs";
import { int } from "@/lib/entities/seo-text";
import CompareTwoClient, { type CompareTwoEntry } from "./CompareTwoClient";

/**
 * Le comparateur (bloc 2, 2026-09-09) : deux communes face à face, ligne par
 * ligne, par habitant, sur les indicateurs OFGL de l'index national. C'est
 * l'objet qui circule : une URL nominative, « Pantin face à Aubervilliers ».
 */
export const dynamic = "force-dynamic";

const KEYS = ["depenses_totales", "recettes_totales", "frais_personnel", "impots_locaux", "encours_dette", "epargne_brute"];

function entry(slug: string): CompareTwoEntry | null {
  const c = findCommuneByAny(slug);
  if (!c) return null;
  const kpis: Record<string, number | null> = {};
  for (const k of KEYS) kpis[k] = c.kpis?.[k]?.eur_hab ?? null;
  const tx = loadTaux(c.insee);
  return { slug: c.slug, nom: c.nom, dep_name: c.dep_name, pop: c.pop, kpis, taux: tx ? { annee: tx.annee, tfb: tx.tfb, mediane: tx.mediane } : null };
}

export async function generateMetadata({ params }: { params: Promise<{ a: string; b: string }> }): Promise<Metadata> {
  const { a, b } = await params;
  const A = findCommuneByAny(a);
  const B = findCommuneByAny(b);
  if (!A || !B || A.slug === B.slug) notFound();
  const path = `/fr/compare/${A.slug}/${B.slug}`;

  // Pilote du sitemap (lib/compare-pairs.ts) : une comparaison par commune de
  // 10 000 habitants ou plus. Sa paire a une seule adresse canonique — l'ordre
  // inverse y renvoie — et un titre qui répond avec la première ligne de la
  // page : les dépenses par habitant, l'année des comptes. Une année vieille de
  // plus de deux ans ne va pas dans un titre (lib/seo/sections/marseille.ts).
  // Toute autre comparaison garde son titre et sa propre adresse.
  const pair = pilotPair(A.slug, B.slug);
  const year = loadAllCommunesYear();
  const va = A.kpis?.depenses_totales?.eur_hab;
  const vb = B.kpis?.depenses_totales?.eur_hab;
  if (pair && year != null && year >= new Date().getFullYear() - 2 && va != null && vb != null && va > 0 && vb > 0) {
    const fr = (v: number) => `${int(Math.round(v), "fr")}\u00a0€`;
    const en = (v: number) => `€${int(Math.round(v), "en")}`;
    return buildLocaleAwareMetadata({
      title: `${A.nom} face à ${B.nom} : ${fr(va)} contre ${fr(vb)} dépensés par habitant (${year})`,
      description: `En ${year}, ${A.nom} (${A.dep_name}) a dépensé ${fr(va)} par habitant, ${B.nom} (${B.dep_name}) ${fr(vb)}. Côte à côte, par habitant : recettes, personnel, impôts locaux, dette, épargne. Source : OFGL, comptes ${year}.`,
      en: {
        title: `${A.nom} vs ${B.nom}: ${en(va)} vs ${en(vb)} spent per inhabitant (${year})`,
        description: `In ${year}, ${A.nom} (${A.dep_name}) spent ${en(va)} per inhabitant, ${B.nom} (${B.dep_name}) ${en(vb)}. Side by side, per inhabitant: revenue, staff, local taxes, debt, savings. Source: OFGL, ${year} accounts.`,
      },
      path: `/fr/compare/${pair[0]}/${pair[1]}`,
    });
  }

  return buildLocaleAwareMetadata({
    title: `${A.nom} face à ${B.nom} : dépenses, dette et impôts par habitant`,
    description: `Deux communes côte à côte, par habitant : dépenses, recettes, personnel, impôts locaux, dette, épargne. Comptes OFGL.`,
    en: {
      title: `${A.nom} versus ${B.nom}: spending, debt and taxes per inhabitant`,
      description: `Two towns side by side, per inhabitant: spending, revenue, staff, local taxes, debt, savings. OFGL accounts.`,
    },
    path,
  });
}

export default async function CompareTwoPage({ params }: { params: Promise<{ a: string; b: string }> }) {
  const { a, b } = await params;
  const A = entry(a);
  const B = entry(b);
  const idx = loadAllCommunesIndex();
  if (!A || !B || A.slug === B.slug || !idx) notFound();
  return <CompareTwoClient a={A} b={B} keys={KEYS} year={idx.year} sourceUrl={idx.source_url} />;
}
