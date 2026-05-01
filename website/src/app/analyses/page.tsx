import type { Metadata } from "next";
import "../fusion.css";

import { Navbar, Footer } from "@/components/fusion";
import { getAllPosts } from "@/lib/blog";
import { buildLocaleAwareMetadata } from "@/lib/seo";
import AnalysesClient from "./AnalysesClient";

export async function generateMetadata(): Promise<Metadata> {
  return buildLocaleAwareMetadata({
    title: "Analyses — France Open Data",
    description:
      "Analyses, enquêtes, portraits et explications : ce que les données publiques permettent de comprendre sur les finances des collectivités françaises.",
    en: {
      title: "Analyses — France Open Data",
      description:
        "Investigations, profiles, and explainers — what public data lets us understand about French local-government finance.",
    },
    path: "/analyses",
  });
}

const PLANNED: { title: string; description: string; tag: string }[] = [
  {
    tag: "Enquête",
    title: "Les avenants BTP : pourquoi un chantier finit en moyenne plus cher que prévu.",
    description:
      "Entre montant notifié et montant final, la dérive sur les chantiers urbains parisiens. À paraître quand le pipeline aura enrichi les codes CPV historiques et reconstitué les montants finaux exécutés.",
  },
  {
    tag: "Portrait",
    title: "Le 7ᵉ arrondissement par ses chiffres : SRU à 4 %, foncier d'État, ministères.",
    description:
      "Troisième de la série « Portraits d'arrondissement ». L'envers du 19ᵉ et du 13ᵉ : le taux SRU le plus bas de Paris, et un foncier verrouillé par l'État depuis le XVIIᵉ siècle.",
  },
];

function inferCategory(tags?: string[], categoryMeta?: string): string {
  if (categoryMeta) {
    const c = categoryMeta.toLowerCase();
    if (c.startsWith("enquê")) return "Enquêtes";
    if (c.startsWith("portr")) return "Portraits";
    // explic / méth / analyse (legacy) → Explications
    return "Explications";
  }
  const t = new Set((tags ?? []).map((x) => x.toLowerCase()));
  if (t.has("enquête") || t.has("transparence")) return "Enquêtes";
  if (t.has("portrait")) return "Portraits";
  return "Explications";
}

export default function AnalysesPage() {
  const rawPosts = getAllPosts();
  const posts = rawPosts.map((p) => ({
    ...p,
    category: inferCategory(p.tags, p.category),
  }));
  return (
    <div className="theme-fusion">
      <Navbar />
      {/* PLANNED list intentionally not rendered for now — section "Les fondamentaux / En préparation" retirée du flux public. La constante PLANNED reste définie en repo comme roadmap interne. */}
      <AnalysesClient posts={posts} planned={[]} />
      <Footer />
    </div>
  );
}
