import type { Metadata } from "next";

import { getDeptLevel3Entry } from "@/lib/budget-drilldown";
import { renderDrilldownPage } from "@/lib/render-drilldown-page";
import { readLocale } from "@/lib/seo";

type Params = { level2: string; level3: string };

const BASE_PATH = "/france/daily-bread";

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { level2, level3 } = await params;
  const locale = await readLocale();
  const l3 = getDeptLevel3Entry(
    decodeURIComponent(level2),
    decodeURIComponent(level3),
  );
  if (!l3) {
    return {
      title:
        locale === "en"
          ? "Drill-down not found — France Open Data"
          : "Détail introuvable — France Open Data",
      robots: { index: false },
    };
  }
  const label = locale === "en" ? l3.label_en : l3.label_fr;
  const title = `${label} — Départements · Daily Bread · France Open Data`;
  const canonical = `${BASE_PATH}/bucket/local/dept/${level2}/${level3}`;
  return {
    title,
    alternates: {
      canonical,
      languages: { "fr-FR": canonical, "en-US": canonical },
    },
  };
}

export default async function StandaloneDeptL3Page({
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
    kind: "local-dept-level3",
  });
}
