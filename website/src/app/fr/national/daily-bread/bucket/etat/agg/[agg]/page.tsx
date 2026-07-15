import type { Metadata } from "next";

import { getEtatAggregation } from "@/lib/budget-drilldown";
import { renderDrilldownPage } from "@/lib/render-drilldown-page";
import { readLocale } from "@/lib/seo";

type Params = { agg: string };

const BASE_PATH = "/france/daily-bread";

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { agg } = await params;
  const locale = await readLocale();
  const found = getEtatAggregation(decodeURIComponent(agg));
  if (!found) {
    return {
      title:
        locale === "en"
          ? "Aggregate not found — France Open Data"
          : "Agrégat introuvable — France Open Data",
      robots: { index: false },
    };
  }
  const label = locale === "en" ? found.label_en : found.label_fr;
  const title = `${label} — État · Daily Bread · France Open Data`;
  const canonical = `${BASE_PATH}/bucket/etat/agg/${agg}`;
  return {
    title,
    alternates: {
      canonical,
      languages: { "fr-FR": canonical, "en-US": canonical },
    },
  };
}

export default async function StandaloneAggPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  return renderDrilldownPage({
    params,
    searchParams,
    voice: "perso",
    basePath: BASE_PATH,
    isDrawer: false,
    kind: "etat-aggregation",
  });
}
