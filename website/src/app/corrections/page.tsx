import type { Metadata } from "next";
import "../fusion.css";
import { buildLocaleAwareMetadata } from "@/lib/seo";
import { loadCorrections } from "@/lib/corrections";
import CorrectionsClient from "./CorrectionsClient";

export async function generateMetadata(): Promise<Metadata> {
  return buildLocaleAwareMetadata({
    title: "Corrections — historique public des modifications",
    description:
      "Toutes les corrections appliquées aux chiffres et à la méthodologie depuis la mise en ligne. Catégorie, date, périmètre, avant/après, signalement à l'origine du changement.",
    en: {
      title: "Corrections — public history of changes",
      description:
        "All corrections applied to figures and methodology since launch. Category, date, scope, before/after, source of the report.",
    },
    path: "/corrections",
  });
}

export default async function CorrectionsPage() {
  const doc = await loadCorrections();
  return <CorrectionsClient doc={doc} />;
}
