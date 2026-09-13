import type { Metadata } from "next";
import "@/app/fusion.css";

import PlacesClient from "./PlacesClient";
import { loadSfPlacesIndex } from "@/lib/us/sf-places-data";
import { answerMetadata } from "@/lib/seo/page-answer";
import { readSiteLocale } from "@/lib/seo";
import { sfPlacesHub, SfHubJsonLd } from "@/lib/seo/sections/sf";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await readSiteLocale();
  const hub = sfPlacesHub();
  return answerMetadata(hub.answer, hub.path, locale);
}

export default async function SfPlacesPage() {
  const places = loadSfPlacesIndex();
  const totalDocs = places.reduce((s, p) => s + p.n_documents, 0);
  // funds_usd = contract dollars paid to vendors for work at the place — the
  // one non-double-counted money figure per place (see sf-places-data.ts).
  const totalFunds = places.reduce((s, p) => s + (p.funds_usd ?? 0), 0);
  const nDepts = new Set(places.map((p) => p.owning_dept_code)).size;

  return (
    <>
    <SfHubJsonLd hub={sfPlacesHub()} />
    <PlacesClient
      places={places}
      totalDocs={totalDocs}
      totalFunds={totalFunds}
      nDepts={nDepts}
    />
    </>
  );
}
