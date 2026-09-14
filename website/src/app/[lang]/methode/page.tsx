import type { Metadata } from "next";
import "@/app/fusion.css";
import { buildLocaleAwareMetadata } from "@/lib/seo";
import MethodeClient from "./MethodeClient";

export async function generateMetadata(): Promise<Metadata> {
  return buildLocaleAwareMetadata({
    title: "Méthode",
    description:
      "Architecture technique, sources, modèles dbt, enrichissements LLM, choix éditoriaux, limites et pipeline ouvert sous licence MIT : la méthodologie complète derrière chaque outil de Qipu.",
    en: {
      title: "Method",
      description:
        "Technical architecture, sources, dbt models, LLM enrichments, editorial choices, limits, and MIT-licensed pipeline: the full methodology behind every tool on Qipu.",
    },
    path: "/methode",
  });
}

export default function MethodePage() {
  return <MethodeClient />;
}
