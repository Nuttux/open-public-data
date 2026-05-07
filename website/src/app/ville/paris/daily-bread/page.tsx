import type { Metadata } from "next";
import { Suspense } from "react";
import "@/app/fusion.css";
import { loadEurostatCofog, loadDailyBread } from "@/lib/national-data";
import { loadDrilldown, type BucketKey } from "@/lib/budget-drilldown";
import { buildLocaleAwareMetadata } from "@/lib/seo";
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
  const base = await buildLocaleAwareMetadata({
    title: "Daily Bread — où va chaque mois de mon salaire · France Open Data",
    description:
      "Combien tu paies de prélèvements obligatoires par mois, et où ça part — Sécu, État, collectivités. Calcul personnalisé selon ton salaire, tes parts et ta commune.",
    en: {
      title: "Daily Bread — where each month of my salary goes · France Open Data",
      description:
        "How much you pay in compulsory levies per month, and where it goes — social security, central government, local. Personalised by salary, household and city.",
    },
    path: "/ville/paris/daily-bread",
  });
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
  {
    level2: string[];
    level3: Record<string, string[]>;
    /** key `${level2}.${level3}` → liste des keys level4. */
    level4: Record<string, string[]>;
  }
> & {
  /** État seulement — keys d'aggregations dispo (`regaliens`, `education`…). */
  etatAggregations: string[];
  /** Local seulement — keys level2 dans le scope département. */
  localDept: string[];
  /** Local seulement — keys level2 dans le scope région. */
  localRegion: string[];
};

export default async function DailyBreadPage() {
  const cofog = loadEurostatCofog();
  const db = loadDailyBread();
  // Index compact des keys disponibles par bucket dans le drilldown.json.
  // Le client utilise cet index + des règles d'alias (préfixe `{level2}_`,
  // F-codes OFGL → noms sémantiques, etc.) pour décider quelles rows
  // DeepDive sont cliquables et calculer leur URL drawer.
  const drilldown = loadDrilldown();
  const buildIndex = (bucket: BucketKey) => {
    const entries = drilldown?.buckets?.[bucket]?.level2 ?? [];
    const level3: Record<string, string[]> = {};
    const level4: Record<string, string[]> = {};
    for (const e of entries) {
      if (e.level3?.length) {
        level3[e.key] = e.level3.map((c) => c.key);
        for (const c of e.level3) {
          if (c.level4?.length) {
            level4[`${e.key}.${c.key}`] = c.level4.map((g) => g.key);
          }
        }
      }
    }
    return { level2: entries.map((e) => e.key), level3, level4 };
  };
  const etatAggKeys =
    drilldown?.buckets?.etat?.aggregations?.map((a) => a.key) ?? [];
  const localDeptKeys =
    drilldown?.buckets?.local?.departement?.level2?.map((e) => e.key) ?? [];
  const localRegionKeys =
    drilldown?.buckets?.local?.region?.level2?.map((e) => e.key) ?? [];
  const drilldownIndex: DrilldownIndex = {
    secu: buildIndex("secu"),
    etat: buildIndex("etat"),
    local: buildIndex("local"),
    etatAggregations: etatAggKeys,
    localDept: localDeptKeys,
    localRegion: localRegionKeys,
  };
  // Suspense boundary needed because the client uses useSearchParams() to
  // sync form state with the URL — Next.js requires a fallback for SSR/SSG.
  return (
    <Suspense fallback={null}>
      <DailyBreadClient cofog={cofog} db={db} drilldownIndex={drilldownIndex} />
    </Suspense>
  );
}
