import type { Metadata } from "next";

import { getDrilldownEntry, type BucketKey } from "@/lib/budget-drilldown";
import { renderDrilldownPage } from "@/lib/render-drilldown-page";
import { readLocale } from "@/lib/seo";

type Params = { bucket: string; level2: string };

const VALID_BUCKETS = new Set<BucketKey>(["secu", "etat", "local"]);
const BASE_PATH = "/fr/national/budget";

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { bucket, level2 } = await params;
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
  );
  if (!found || found.kind !== "level2") {
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
  const bucketLabel =
    locale === "en" ? found.bucket.label_en : found.bucket.label_fr;
  const title =
    locale === "en"
      ? `${label} — ${bucketLabel} · Budget · France Open Data`
      : `${label} — ${bucketLabel} · Budget · France Open Data`;
  const canonical = `${BASE_PATH}/bucket/${bucket}/${level2}`;
  return {
    title,
    alternates: {
      canonical,
      languages: { "fr-FR": canonical, "en-US": canonical },
    },
  };
}

export default async function StandaloneBudgetL2Page({
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
    kind: "level2",
  });
}
