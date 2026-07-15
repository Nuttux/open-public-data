import type { Metadata } from "next";
import "../../fusion.css";
import { loadEtatLFI, loadEtatLFIHistory } from "@/lib/national-data";
import { buildLocaleAwareMetadata } from "@/lib/seo";
import EtatClient from "./EtatClient";

export async function generateMetadata(): Promise<Metadata> {
  return buildLocaleAwareMetadata({
    title: "Budget de l’État — France Open Data",
    description:
      "Le Budget Général de l’État ventilé par mission et par programme : les ~447 Md€ de dépenses nettes prévues au PLF 2025, classées de l’Enseignement scolaire à l’Aide publique au développement.",
    en: {
      title: "French State budget — France Open Data",
      description:
        "Central government Budget Général broken down by mission and programme: the ~€447B of net spending planned for PLF 2025, ranked from school education to overseas development aid.",
    },
    path: "/fr/national/etat",
  });
}

export default async function EtatPage() {
  const etat = loadEtatLFI();
  const history = loadEtatLFIHistory();
  return <EtatClient etat={etat} history={history} />;
}
