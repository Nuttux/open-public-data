import type { Metadata } from "next";
import "../fusion.css";
import { buildLocaleAwareMetadata } from "@/lib/seo";
import MethodeClient from "./MethodeClient";

export async function generateMetadata(): Promise<Metadata> {
  return buildLocaleAwareMetadata({
    title: "Méthode — comment on construit nos chiffres",
    description:
      "Architecture technique, sources, modèles dbt, enrichissements LLM, choix éditoriaux, limites et code ouvert : la méthodologie complète derrière chaque outil de France Open Data.",
    en: {
      title: "Method — how we build our figures",
      description:
        "Technical architecture, sources, dbt models, LLM enrichments, editorial choices, limits, and open code: the full methodology behind every tool on France Open Data.",
    },
    path: "/methode",
  });
}

export default function MethodePage() {
  return <MethodeClient />;
}
