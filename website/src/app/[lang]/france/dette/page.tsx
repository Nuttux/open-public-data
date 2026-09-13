import type { Metadata } from "next";
import "@/app/fusion.css";
import { loadEurostatDette } from "@/lib/national-data";
import { buildLocaleAwareMetadata, readLocale } from "@/lib/seo";
import { FrHubJsonLd, hubMetadataInput, nationalDetteHub } from "@/lib/seo/sections/national";
import DetteClient from "./DetteClient";

export async function generateMetadata(): Promise<Metadata> {
  return buildLocaleAwareMetadata(hubMetadataInput(nationalDetteHub()));
}

export default async function DettePage() {
  const dette = loadEurostatDette();
  const locale = await readLocale();
  return (
    <>
      <FrHubJsonLd hub={nationalDetteHub()} locale={locale} />
      <DetteClient dette={dette} />
    </>
  );
}
