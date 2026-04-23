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
    tag: "Enquête",
    title: "Les avenants BTP : pourquoi un chantier finit en moyenne plus cher que prévu.",
    description:
      "Entre montant notifié et montant final, la dérive est structurelle sur les chantiers urbains parisiens. Cinq causes — archéologie, amiante, normes, fournisseurs, programme — quantifiées sur 14 ans de marchés publics.",
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
