import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "@/app/fusion.css";

import { Navbar, Footer, DailyBreadDrilldownFiche } from "@/components/fusion";
import {
  getDrilldownEntry,
  isStub,
  type BucketKey,
} from "@/lib/daily-bread-drilldown";
import { readLocale } from "@/lib/seo";

type Params = { bucket: string; level2: string };

const VALID_BUCKETS = new Set<BucketKey>(["secu", "etat", "local"]);

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
  const found = getDrilldownEntry(bucket as BucketKey, decodeURIComponent(level2));
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
      ? `${label} — ${bucketLabel} · Daily Bread · France Open Data`
      : `${label} — ${bucketLabel} · Daily Bread · France Open Data`;
  const canonical = `/ville/paris/daily-bread/bucket/${bucket}/${level2}`;
  return {
    title,
    alternates: {
      canonical,
      languages: { "fr-FR": canonical, "en-US": canonical },
    },
  };
}

export default async function StandaloneL2Page({
  params,
}: {
  params: Promise<Params>;
}) {
  const { bucket, level2 } = await params;
  if (!VALID_BUCKETS.has(bucket as BucketKey)) return notFound();
  const bucketKey = bucket as BucketKey;
  const decodedL2 = decodeURIComponent(level2);

  const found = getDrilldownEntry(bucketKey, decodedL2);
  if (!found || found.kind !== "level2") return notFound();

  const locale = await readLocale();
  const entryLabel =
    locale === "en" ? found.entry.label_en : found.entry.label_fr;
  const bucketLabel =
    locale === "en" ? found.bucket.label_en : found.bucket.label_fr;
  const eyebrow =
    locale === "en"
      ? `${bucketLabel} · level 2`
      : `${bucketLabel} · niveau 2`;

  return (
    <div className="theme-fusion">
      <Navbar />
      <section className="fx-page-header">
        <div className="fx-wrap">
          <p className="fx-page-kicker">{eyebrow}</p>
          <h1
            className="fx-page-title"
            style={{ fontSize: "clamp(28px, 4vw, 48px)" }}
          >
            {entryLabel}
          </h1>
        </div>
      </section>
      <div className="fx-fiche-wrap">
        <DailyBreadDrilldownFiche
          bucket={found.bucket}
          bucketKey={bucketKey}
          level2={found.entry}
          isStub={isStub()}
        />
      </div>
      <Footer />
    </div>
  );
}
