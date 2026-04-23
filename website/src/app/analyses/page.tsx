import type { Metadata } from "next";
import "../fusion.css";

import { Navbar, Footer } from "@/components/fusion";
import { getAllPosts } from "@/lib/blog";
import AnalysesClient from "./AnalysesClient";

export const metadata: Metadata = {
  title: "Analyses — France Open Data",
  description:
    "Analyses, enquêtes, portraits et explications : ce que les données publiques permettent de comprendre sur les finances des collectivités françaises.",
  alternates: { canonical: "/analyses" },
};

const PLANNED: { title: string; description: string; tag: string }[] = [
  {
    tag: "Enquête",
    title: "Les avenants BTP : +18 % en moyenne, pourquoi ?",
    description:
      "Entre montant notifié et montant final, la dérive est structurelle sur les chantiers urbains. Cinq causes — archéologie, amiante, normes, fournisseurs, programme.",
  },
  {
    tag: "Portrait",
    title: "Paris Habitat : 80 000 logements, 1ᵉʳ bailleur social de France.",
    description:
      "Géographie du parc, modèle économique, place dans la politique de logement social parisienne. Anatomie d'un EPL devenu inséparable de la Ville.",
  },
  {
    tag: "Explication",
    title: "Loi SRU à Paris : qui est en retard, qui paie, qui mutualise.",
    description:
      "Huit arrondissements sous le seuil de 25 % de logement social. Le mécanisme des pénalités, la mutualisation interne et ce que la loi exige vraiment.",
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
      <AnalysesClient posts={posts} planned={PLANNED} />
      <Footer />
    </div>
  );
}
