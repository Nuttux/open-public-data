import type { Metadata } from "next";
import "@/app/fusion.css";
import { buildLocaleAwareMetadata } from "@/lib/seo";
import LicenceClient from "./LicenceClient";

export async function generateMetadata(): Promise<Metadata> {
  return buildLocaleAwareMetadata({
    title: "Licence",
    description:
      "Code du pipeline sous licence MIT, données sous la licence de leur source (ODbL, Licence Ouverte 2.0, CC BY 4.0, PDDL), textes sous CC BY 4.0. Ce que vous pouvez réutiliser et comment citer.",
    en: {
      title: "License",
      description:
        "Pipeline code under the MIT licence, data under the licence of its source (ODbL, Etalab Open Licence 2.0, CC BY 4.0, PDDL), text under CC BY 4.0. What you can reuse and how to credit it.",
    },
    path: "/licence",
  });
}

export default function LicencePage() {
  return <LicenceClient />;
}
