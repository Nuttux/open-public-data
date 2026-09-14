import type { Metadata } from "next";
import "@/app/fusion.css";
import { buildLocaleAwareMetadata } from "@/lib/seo";
import LicenceClient from "./LicenceClient";

export async function generateMetadata(): Promise<Metadata> {
  return buildLocaleAwareMetadata({
    title: "Licence",
    description:
      "Licences appliquées au site : code AGPL-3.0, données ODbL 1.0 ou Licence Ouverte 2.0 selon la source, contenus éditoriaux CC BY 4.0. Conditions de réutilisation et attribution.",
    en: {
      title: "License",
      description:
        "Licenses applied to the site: AGPL-3.0 for code, ODbL 1.0 or Etalab Open Licence 2.0 for data depending on the source, CC BY 4.0 for editorial content. Reuse conditions and attribution.",
    },
    path: "/licence",
  });
}

export default function LicencePage() {
  return <LicenceClient />;
}
