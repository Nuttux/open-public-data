import type { Metadata } from "next";
import "../fusion.css";
import { loadEurostatCofog } from "@/lib/national-data";
import { buildLocaleAwareMetadata } from "@/lib/seo";
import ApuClient from "./ApuClient";

export async function generateMetadata(): Promise<Metadata> {
  return buildLocaleAwareMetadata({
    title: "Dépenses publiques — APU consolidé · France Open Data",
    description:
      "Comment se ventilent les ~57 % du PIB des dépenses publiques françaises (APU consolidé) par fonction COFOG, et comment la France se positionne par rapport à ses voisins européens.",
    en: {
      title: "Government spending — consolidated APU · France Open Data",
      description:
        "How France's ~57% GDP general government expenditure breaks down by COFOG function, and how it compares to European peers.",
    },
    path: "/fr/national",
  });
}

export default async function ApuPage() {
  const cofog = loadEurostatCofog();
  return <ApuClient cofog={cofog} />;
}
