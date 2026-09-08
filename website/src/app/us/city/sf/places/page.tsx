import type { Metadata } from "next";
import "@/app/fusion.css";

import PlacesClient from "./PlacesClient";
import { loadSfPlacesIndex } from "@/lib/us/sf-places-data";
import { sectionAlternates } from "@/lib/seo/page-answer";

export const metadata: Metadata = {
  ...sectionAlternates("/us/city/sf/places", "en"),
  title: "San Francisco — Places",
  description:
    "Parks, libraries, hospitals, piers: for each San Francisco place, the city money that reaches it and the historical documents held at the Internet Archive — every fact linked to its source.",
};

export default async function SfPlacesPage() {
  const places = loadSfPlacesIndex();
  const totalDocs = places.reduce((s, p) => s + p.n_documents, 0);
  // funds_usd = contract dollars paid to vendors for work at the place — the
  // one non-double-counted money figure per place (see sf-places-data.ts).
  const totalFunds = places.reduce((s, p) => s + (p.funds_usd ?? 0), 0);
  const nDepts = new Set(places.map((p) => p.owning_dept_code)).size;

  return (
    <PlacesClient
      places={places}
      totalDocs={totalDocs}
      totalFunds={totalFunds}
      nDepts={nDepts}
    />
  );
}
