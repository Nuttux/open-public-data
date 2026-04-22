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
    tag: "Explication",
    title: "La règle d'or des communes : ce que dit vraiment le CGCT.",
    description:
      "Une commune ne peut pas emprunter pour payer ses salaires. L'article L.1612-4 explique pourquoi, et ce qui se passe si la règle est cassée.",
  },
  {
    tag: "Analyse",
    title: "Le 13ᵉ et le 17ᵉ : deux géographies d'investissement.",
    description:
      "ZAC Paris Rive Gauche vs Clichy-Batignolles. Deux stratégies de foncier public, deux trajectoires de livraison, deux taux SRU différents.",
  },
  {
    tag: "Enquête",
    title: "Les avenants BTP : +18 % en moyenne, pourquoi ?",
    description:
      "Entre montant notifié et montant final, la dérive est structurelle sur les chantiers urbains. Cinq causes — archéologie, amiante, normes, fournisseurs, programme.",
  },
  {
    tag: "Portrait",
    title: "CASVP, le bénéficiaire n°1 de la Ville.",
    description:
      "Le Centre d'Action Sociale de la Ville de Paris reçoit 416 M€ par an. Anatomie d'un opérateur public — budget, effectifs, dispositifs.",
  },
  {
    tag: "Explication",
    title: "Le patrimoine parisien : 17 Md€ nets, et pourquoi c'est approximatif.",
    description:
      "Valeur comptable M57 vs valeur de marché : un écart qu'on ne peut pas chiffrer, mais qu'on peut expliquer. Ce que le bilan dit, et ne dit pas.",
  },
];

function inferCategory(tags?: string[], categoryMeta?: string): string {
  if (categoryMeta) {
    const c = categoryMeta.toLowerCase();
    if (c.startsWith("enquê")) return "Enquêtes";
    if (c.startsWith("explic") || c.startsWith("méth") || c.startsWith("meth")) return "Explications";
    if (c.startsWith("portr")) return "Portraits";
    if (c.startsWith("analyse")) return "Analyses";
  }
  const t = new Set((tags ?? []).map((x) => x.toLowerCase()));
  if (t.has("enquête") || t.has("transparence")) return "Enquêtes";
  if (t.has("guide") || t.has("pédagogie") || t.has("explication") || t.has("méthode")) return "Explications";
  if (t.has("portrait")) return "Portraits";
  if (t.has("analyse")) return "Analyses";
  return "Analyses";
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
