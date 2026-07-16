import type { Metadata } from "next";
import "@/app/fusion.css";
import { loadEurostatFiscalite } from "@/lib/national-data";
import { buildLocaleAwareMetadata } from "@/lib/seo";
import FiscaliteClient from "./FiscaliteClient";

export async function generateMetadata(): Promise<Metadata> {
  return buildLocaleAwareMetadata({
    title: "Fiscalité française : ce qu’on paie — France Open Data",
    description:
      "Structure des prélèvements obligatoires en France : cotisations sociales, TVA, impôt sur le revenu, impôt sur les sociétés, autres taxes — en % du PIB et en milliards d’euros, depuis 2010.",
    en: {
      title: "French taxation: what we pay — France Open Data",
      description:
        "Structure of compulsory levies in France: social contributions, VAT, income tax, corporate tax, other taxes — as % of GDP and in billion euros, since 2010.",
    },
    path: "/fr/national/fiscalite",
  });
}

export default async function FiscalitePage() {
  const fiscalite = loadEurostatFiscalite();
  return <FiscaliteClient fiscalite={fiscalite} />;
}
