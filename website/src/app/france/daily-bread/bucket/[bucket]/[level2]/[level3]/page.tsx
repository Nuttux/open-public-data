import type { Metadata } from "next";

import { getDrilldownEntry, type BucketKey } from "@/lib/budget-drilldown";
import { renderDrilldownPage } from "@/lib/render-drilldown-page";
import { readLocale } from "@/lib/seo";

type Params = { bucket: string; level2: string; level3: string };

const VALID_BUCKETS = new Set<BucketKey>(["secu", "etat", "local"]);
const BASE_PATH = "/ville/paris/daily-bread";

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { bucket, level2, level3 } = await params;
  const locale = await readLocale();
  if (!VALID_BUCKETS.has(bucket as BucketKey)) {
    return {
      title:
        locale === "en"
          ? "Drill-down not found — France Open Data"
          : "Détail introuvable — France Open Data",
      robots: { index: false },
    };
  }
  const found = getDrilldownEntry(
    bucket as BucketKey,
    decodeURIComponent(level2),
    decodeURIComponent(level3),
  );
  if (!found || found.kind !== "level3") {
    return {
      title:
        locale === "en"
          ? "Drill-down not found — France Open Data"
          : "Détail introuvable — France Open Data",
      robots: { index: false },
    };
  }
  const label =
    locale === "en" ? found.entry.label_en : found.entry.label_fr;
  const parentLabel =
    locale === "en" ? found.parent.label_en : found.parent.label_fr;
  const title = `${label} — ${parentLabel} · Daily Bread · France Open Data`;
  const canonical = `${BASE_PATH}/bucket/${bucket}/${level2}/${level3}`;
  return {
    title,
    alternates: {
      canonical,
      languages: { "fr-FR": canonical, "en-US": canonical },
    },
  };
}

export default async function StandaloneL3Page({
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
    kind: "level3",
  });
}
