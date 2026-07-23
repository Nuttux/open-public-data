import type { Metadata } from "next";
import "@/app/fusion.css";

import MarseilleLandingClient from "@/components/marseille/MarseilleLandingClient";
import { loadMarseilleLandingData } from "@/lib/marseille/marseille-landing-data";
import { buildLocaleAwareMetadata } from "@/lib/seo";

// Marseille hub — the shared <Landing> template fed by a Marseille adapter
// (lib/marseille/marseille-landing-model). Data is loaded server-side and
// handed to the client wrapper so the FR/EN toggle rebuilds the model live.

export async function generateMetadata(): Promise<Metadata> {
  return buildLocaleAwareMetadata({
    title: "Marseille — l'argent public de la Ville",
    description:
      "Le budget, les subventions, les marchés et les lieux de la Ville de Marseille — chaque chiffre relié à sa source dans l'open data.",
    en: {
      title: "Marseille — the City's public money",
      description:
        "The budget, grants, contracts and places of the Ville de Marseille — every figure linked to its open-data source.",
    },
    path: "/fr/city/marseille",
  });
}

export default async function MarseilleHubPage() {
  const data = loadMarseilleLandingData();
  return <MarseilleLandingClient data={data} />;
}
