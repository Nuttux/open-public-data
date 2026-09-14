import type { Metadata } from "next";
import "@/app/fusion.css";

import { Navbar, Footer } from "@/components/fusion";
import { notFound } from "next/navigation";
import { getAllPosts } from "@/lib/blog";
import { ANALYSES_PUBLIC } from "@/lib/analyses-visibility";
import { buildLocaleAwareMetadata } from "@/lib/seo";
import AnalysesClient from "./AnalysesClient";

export async function generateMetadata(): Promise<Metadata> {
  return buildLocaleAwareMetadata({
    title: "Notes de méthode",
    description:
      "Comment lire un document public, et comment chaque chiffre du site est fabriqué, de la source à la page.",
    en: {
      title: "Method notes",
      description:
        "How to read a public document, and how each figure on this site is built, from the source to the page.",
    },
    path: "/analyses",
  });
}

const _PLANNED: { title: string; description: string; tag: string }[] = [
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
  if (!ANALYSES_PUBLIC) notFound();
  const rawPosts = getAllPosts();
  const posts = rawPosts.map((p) => ({
    ...p,
    category: inferCategory(p.tags, p.category),
  }));
  return (
    <div className="theme-fusion">
      <Navbar />
      <main id="main-content" tabIndex={-1}>
      {/* _PLANNED (« à paraître ») deliberately not rendered: editorial promises, not published notes. The constant stays in the repo as an internal roadmap. */}
      <AnalysesClient posts={posts} planned={[]} />
      </main>
      <Footer />
    </div>
  );
}
