import type { Metadata } from "next";
import "@/app/fusion.css";
import { loadEtatLFI, loadEtatLFIHistory } from "@/lib/national-data";
import { buildLocaleAwareMetadata, readLocale } from "@/lib/seo";
import { FrHubJsonLd, hubMetadataInput, nationalEtatHub } from "@/lib/seo/sections/national";
import EtatClient from "./EtatClient";

export async function generateMetadata(): Promise<Metadata> {
  return buildLocaleAwareMetadata(hubMetadataInput(nationalEtatHub()));
}

export default async function EtatPage() {
  const etat = loadEtatLFI();
  const history = loadEtatLFIHistory();
  const locale = await readLocale();
  return (
    <>
      <FrHubJsonLd hub={nationalEtatHub()} locale={locale} />
      <EtatClient etat={etat} history={history} />
    </>
  );
}
