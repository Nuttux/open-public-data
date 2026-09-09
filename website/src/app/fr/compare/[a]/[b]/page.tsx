import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "@/app/fusion.css";
import { findCommuneByAny, loadAllCommunesIndex } from "@/lib/all-communes";
import { buildLocaleAwareMetadata } from "@/lib/seo";
import { loadTaux } from "@/lib/commune-taux";
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
  return buildLocaleAwareMetadata({
    title: `${A.nom} face à ${B.nom} : dépenses, dette et impôts par habitant`,
    description: `Deux communes côte à côte, par habitant : dépenses, recettes, personnel, impôts locaux, dette, épargne. Comptes OFGL.`,
    en: {
      title: `${A.nom} versus ${B.nom}: spending, debt and taxes per inhabitant`,
      description: `Two towns side by side, per inhabitant: spending, revenue, staff, local taxes, debt, savings. OFGL accounts.`,
    },
    path: `/fr/compare/${A.slug}/${B.slug}`,
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
