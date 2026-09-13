import type { Metadata } from "next";
import "@/app/fusion.css";

import MarseilleLandingClient from "@/components/marseille/MarseilleLandingClient";
import { loadMarseilleLandingData } from "@/lib/marseille/marseille-landing-data";
import { buildLocaleAwareMetadata, readLocale } from "@/lib/seo";
import { FrHubJsonLd, hubMetadataInput } from "@/lib/seo/sections/national";
import { marseilleCityHub } from "@/lib/seo/sections/marseille";

// Marseille hub — the shared <Landing> template fed by a Marseille adapter
// (lib/marseille/marseille-landing-model). Data is loaded server-side and
// handed to the client wrapper so the FR/EN toggle rebuilds the model live.

export async function generateMetadata(): Promise<Metadata> {
  return buildLocaleAwareMetadata(hubMetadataInput(marseilleCityHub()));
}

export default async function MarseilleHubPage() {
  const data = loadMarseilleLandingData();
  const locale = await readLocale();
  return (
    <>
      <FrHubJsonLd hub={marseilleCityHub()} locale={locale} />
      <MarseilleLandingClient data={data} />
    </>
  );
}
