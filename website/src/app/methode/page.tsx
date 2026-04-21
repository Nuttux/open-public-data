import type { Metadata } from "next";
import "../fusion.css";
import { buildPageMetadata } from "@/lib/seo";
import MethodeClient from "./MethodeClient";

export const metadata: Metadata = buildPageMetadata({
  title: "Méthode — comment on construit nos chiffres",
  description:
    "Architecture technique, sources, modèles dbt, enrichissements LLM, choix éditoriaux, limites et code ouvert : la méthodologie complète derrière chaque outil de Données Lumières.",
  path: "/methode",
});

export default function MethodePage() {
  return <MethodeClient />;
}
