import type { Metadata } from "next";
import { Suspense } from "react";
import "@/app/fusion.css";
import { loadDailyBread } from "@/lib/national-data";
import { loadDrilldown, type BucketKey } from "@/lib/budget-drilldown";
import { buildLocaleAwareMetadata, readLocale } from "@/lib/seo";
import { FrHubJsonLd, hubMetadataInput, nationalDailyBreadHub } from "@/lib/seo/sections/national";
import DailyBreadClient from "./DailyBreadClient";

// generateMetadata reads URL search params to build a personalised
// `og:image` URL → `/api/og-poster?...`. Force dynamic rendering so
// the metadata reflects the user's current profile when the link is shared.
export const dynamic = "force-dynamic";

type Search = Promise<Record<string, string | string[] | undefined>>;

const POSTER_PARAM_KEYS = [
  "net",
  "parts",
  "c",
  "owner",
  "tf",
  "pension",
  "capital",
  "indep_ca",
  "indep_type",
  "lang",
] as const;

function buildPosterPath(sp: Record<string, string | string[] | undefined>): string {
  const params = new URLSearchParams();
  for (const k of POSTER_PARAM_KEYS) {
    const v = sp[k];
    if (typeof v === "string" && v.length > 0) params.set(k, v);
    else if (Array.isArray(v) && v.length && typeof v[0] === "string") params.set(k, v[0]);
  }
  const qs = params.toString();
  return qs ? `/api/og-poster?${qs}` : "/api/og-poster";
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams?: Search;
}): Promise<Metadata> {
  const sp = (await searchParams) ?? {};
  const posterPath = buildPosterPath(sp);
  const base = await buildLocaleAwareMetadata(hubMetadataInput(nationalDailyBreadHub()));
  // Override OG/Twitter image to point to the per-profile poster (1080×1080).
  return {
    ...base,
    openGraph: {
      ...(base.openGraph ?? {}),
      images: [
        {
          url: posterPath,
          width: 1080,
          height: 1080,
          alt: "Daily Bread — mon profil",
        },
      ],
    },
    twitter: {
      ...(base.twitter ?? {}),
      card: "summary_large_image",
      images: [posterPath],
    },
  };
}

export type DrilldownIndex = Record<
  BucketKey,
  { level2: string[]; level3: Record<string, string[]> }
> & {
  /** Buckets éditoriaux État (drilldown.etat.aggregations) — keys exposées
   *  pour permettre au client de filtrer ETAT_TOP_ALIAS_AGG. */
  etat_aggregations?: string[];
  /** Drilldown départemental local (drilldown.local.departement). */
  local_dept?: { level2: string[]; level3: Record<string, string[]> };
  /** Drilldown régional local (drilldown.local.region). */
  local_region?: { level2: string[]; level3: Record<string, string[]> };
};

export default async function DailyBreadPage() {
  const db = loadDailyBread();
  // Index compact des keys disponibles par bucket dans le drilldown.json.
  // Le client utilise cet index + des règles d'alias (préfixe `{level2}_`,
  // F-codes OFGL → noms sémantiques, etc.) pour décider quelles rows
  // DeepDive sont cliquables et calculer leur URL drawer.
  const drilldown = loadDrilldown();
  const buildIndex = (bucket: BucketKey) => {
    const entries = drilldown?.buckets?.[bucket]?.level2 ?? [];
    const level3: Record<string, string[]> = {};
    for (const e of entries) {
      if (e.level3?.length) {
        level3[e.key] = e.level3.map((c) => c.key);
      }
    }
    return { level2: entries.map((e) => e.key), level3 };
  };
  const buildScopeIndex = (
    block:
      | { level2: { key: string; level3?: { key: string }[] }[] }
      | null
      | undefined,
  ) => {
    const entries = block?.level2 ?? [];
    const level3: Record<string, string[]> = {};
    for (const e of entries) {
      if (e.level3?.length) {
        level3[e.key] = e.level3.map((c) => c.key);
      }
    }
    return { level2: entries.map((e) => e.key), level3 };
  };
  const drilldownIndex: DrilldownIndex = {
    secu: buildIndex("secu"),
    etat: buildIndex("etat"),
    local: buildIndex("local"),
    etat_aggregations: (drilldown?.buckets?.etat?.aggregations ?? []).map(
      (a) => a.key,
    ),
    local_dept: buildScopeIndex(drilldown?.buckets?.local?.departement),
    local_region: buildScopeIndex(drilldown?.buckets?.local?.region),
  };
  // Suspense boundary needed because the client uses useSearchParams() to
  // sync form state with the URL — Next.js requires a fallback for SSR/SSG.
  const locale = await readLocale();
  return (
    <>
      <FrHubJsonLd hub={nationalDailyBreadHub()} locale={locale} />
      <Suspense fallback={null}>
        <DailyBreadClient db={db} drilldownIndex={drilldownIndex} />
      </Suspense>
    </>
  );
}
