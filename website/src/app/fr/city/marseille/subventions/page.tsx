import type { Metadata } from "next";
import "@/app/fusion.css";
import { loadQuiRecoitData, loadQuiRecoitIndex } from "@/lib/fusion-data";
import { buildLocaleAwareMetadata } from "@/lib/seo";
import QuiRecoitClient from "@/app/ville/paris/subventions/QuiRecoitClient";

// POC v1 Marseille subventions — réutilise QuiRecoitClient avec data Marseille.
// Limites POC connues (cf. memory project_marseille_v1_decisions, P3.2 option a) :
//   - Subventions Ville uniquement (data.gouv.fr SCDL `marseille-subventions-{year}`)
//     Métropole AMP `subventions-attribuees-depuis-2022` à ajouter en phase 2.
//   - Pas d'enrichissement thématique / vulgarisation / SIRENE pour Marseille
//     (cache vide) → tous les bénéficiaires seront groupés sous "Autres" dans le
//     stackbar par thème, et la facette "thématique" sera vide.
//   - Drill-down beneficiaire (`/ville/marseille/subventions/association/[slug]`)
//     pas implémenté en POC — les liens existent mais routent vers 404.
//   - Pas de drill-down par thème non plus (vu qu'il n'y a pas de thématique).
//   - Pas d'articles éditoriaux Marseille (posts: []).

export async function generateMetadata(): Promise<Metadata> {
  return buildLocaleAwareMetadata({
    title: "Qui reçoit l'argent public à Marseille ? — France Open Data",
    description:
      "Subventions versées par la Ville de Marseille (2017-2022) : bénéficiaires, montants, évolution. Source : data.gouv.fr (SCDL).",
    en: {
      title: "Who receives public money in Marseille? — France Open Data",
      description:
        "Grants paid by the Ville de Marseille (2017-2022): beneficiaries, amounts, trends. Source: data.gouv.fr (SCDL).",
    },
    path: "/ville/marseille/subventions",
  });
}

export default async function QuiRecoitPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const sp = await searchParams;
  const requestedYear = sp.year ? Number(sp.year) : undefined;
  const idx = loadQuiRecoitIndex("marseille");
  const d = loadQuiRecoitData(requestedYear, "marseille");
  // No Marseille-specific blog posts yet — empty list filters out the
  // RelatedArticles section (handled inside QuiRecoitClient).
  const posts: Parameters<typeof QuiRecoitClient>[0]["posts"] = [];
  return <QuiRecoitClient idx={idx} d={d} posts={posts} />;
}
