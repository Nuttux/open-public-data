import type { Metadata } from "next";
import "@/app/fusion.css";
import { loadEurostatFiscalite } from "@/lib/national-data";
import { buildLocaleAwareMetadata, readLocale } from "@/lib/seo";
import { FrHubJsonLd, hubMetadataInput, nationalFiscaliteHub } from "@/lib/seo/sections/national";
import FiscaliteClient from "./FiscaliteClient";

export async function generateMetadata(): Promise<Metadata> {
  return buildLocaleAwareMetadata(hubMetadataInput(nationalFiscaliteHub()));
}

export default async function FiscalitePage() {
  const fiscalite = loadEurostatFiscalite();
  const locale = await readLocale();
  return (
    <>
      <FrHubJsonLd hub={nationalFiscaliteHub()} locale={locale} />
      <FiscaliteClient fiscalite={fiscalite} />
    </>
  );
}
