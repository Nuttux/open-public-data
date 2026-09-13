import type { Metadata } from "next";
import "@/app/fusion.css";

import Landing from "@/components/landing/Landing";
import { buildSfLandingModel } from "@/lib/us/sf-landing-model";
import { answerMetadata } from "@/lib/seo/page-answer";
import { readSiteLocale } from "@/lib/seo";
import { sfCityHub, SfHubJsonLd } from "@/lib/seo/sections/sf";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await readSiteLocale();
  const hub = sfCityHub();
  return answerMetadata(hub.answer, hub.path, locale);
}

export default function SfHubPage() {
  const model = buildSfLandingModel();
  return (
    <>
      <SfHubJsonLd hub={sfCityHub()} />
      <Landing model={model} />
    </>
  );
}
