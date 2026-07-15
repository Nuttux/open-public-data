import type { Metadata } from "next";

import { getRegionEntry } from "@/lib/budget-drilldown";
import { renderDrilldownPage } from "@/lib/render-drilldown-page";
import { readLocale } from "@/lib/seo";

type Params = { level2: string };

const BASE_PATH = "/france/budget";

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { level2 } = await params;
  const locale = await readLocale();
  const entry = getRegionEntry(decodeURIComponent(level2));
  if (!entry) {
    return {
      title:
        locale === "en"
          ? "Drill-down not found — France Open Data"
          : "Détail introuvable — France Open Data",
      robots: { index: false },
    };
  }
  const label = locale === "en" ? entry.label_en : entry.label_fr;
  const title = `${label} — Régions · Budget · France Open Data`;
  const canonical = `${BASE_PATH}/bucket/local/region/${level2}`;
  return {
    title,
    alternates: {
      canonical,
      languages: { "fr-FR": canonical, "en-US": canonical },
    },
  };
}

export default async function StandaloneBudgetRegionL2Page({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  return renderDrilldownPage({
    params,
    searchParams,
    voice: "impersonal",
    basePath: BASE_PATH,
    isDrawer: false,
    kind: "local-region",
  });
}
