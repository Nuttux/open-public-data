import { notFound } from "next/navigation";

import { DetailDrawer, DailyBreadDrilldownFiche } from "@/components/fusion";
import {
  getDrilldownEntry,
  isStub,
  type BucketKey,
} from "@/lib/daily-bread-drilldown";
import { readLocale } from "@/lib/seo";

type Params = { bucket: string; level2: string };

const VALID_BUCKETS = new Set<BucketKey>(["secu", "etat", "local"]);

export default async function DrawerL2Page({
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
  const bucketLabel =
    locale === "en" ? found.bucket.label_en : found.bucket.label_fr;
  const entryLabel =
    locale === "en" ? found.entry.label_en : found.entry.label_fr;
  const eyebrow =
    locale === "en"
      ? `${bucketLabel} · level 2`
      : `${bucketLabel} · niveau 2`;

  const shareUrl = `/ville/paris/daily-bread/bucket/${bucketKey}/${encodeURIComponent(
    decodedL2,
  )}`;

  return (
    <div className="theme-fusion db-drawer-shell">
      <DetailDrawer
        kicker={eyebrow}
        title={entryLabel}
        shareUrl={shareUrl}
        backHref="/ville/paris/daily-bread"
        breadcrumbLabel={entryLabel}
      >
        <DailyBreadDrilldownFiche
          bucket={found.bucket}
          bucketKey={bucketKey}
          level2={found.entry}
          isStub={isStub()}
        />
      </DetailDrawer>
    </div>
  );
}
