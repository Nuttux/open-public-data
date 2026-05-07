import type { Metadata } from "next";
import "../../fusion.css";
import { loadEurostatDette } from "@/lib/national-data";
import { buildLocaleAwareMetadata } from "@/lib/seo";
import DetteClient from "./DetteClient";

export async function generateMetadata(): Promise<Metadata> {
  return buildLocaleAwareMetadata({
    title: "Dette publique française — France Open Data",
    description:
      "Dette des administrations publiques françaises (Maastricht) ventilée par sous-secteur — État, collectivités, Sécurité sociale — en % du PIB et en milliards d'euros, série trimestrielle 2000-aujourd'hui.",
    en: {
      title: "French government debt — France Open Data",
      description:
        "Maastricht government debt of France broken down by sub-sector — central, local, social security — as % of GDP and in billion euros, quarterly series from 2000 to today.",
    },
    path: "/france/dette",
  });
}

export default async function DettePage() {
  const dette = loadEurostatDette();
  return <DetteClient dette={dette} />;
}
