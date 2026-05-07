import { notFound } from "next/navigation";

import { DetailDrawer, DailyBreadDrilldownFiche } from "@/components/fusion";
import {
  getDrilldownEntry,
  isStub,
  type BucketKey,
} from "@/lib/daily-bread-drilldown";
import { readLocale } from "@/lib/seo";

type Params = { bucket: string; level2: string; level3: string };

const VALID_BUCKETS = new Set<BucketKey>(["secu", "etat", "local"]);

export default async function DrawerL3Page({
  params,
}: {
  params: Promise<Params>;
}) {
  const { bucket, level2, level3 } = await params;
  if (!VALID_BUCKETS.has(bucket as BucketKey)) return notFound();
  const bucketKey = bucket as BucketKey;
  const decodedL2 = decodeURIComponent(level2);
  const decodedL3 = decodeURIComponent(level3);

  const found = getDrilldownEntry(bucketKey, decodedL2, decodedL3);
  if (!found || found.kind !== "level3") return notFound();

  const locale = await readLocale();
  const bucketLabel =
    locale === "en" ? found.bucket.label_en : found.bucket.label_fr;
  const parentLabel =
    locale === "en" ? found.parent.label_en : found.parent.label_fr;
  const entryLabel =
    locale === "en" ? found.entry.label_en : found.entry.label_fr;
  const eyebrow =
    locale === "en"
      ? `${bucketLabel} · ${parentLabel} · level 3`
      : `${bucketLabel} · ${parentLabel} · niveau 3`;

  const shareUrl = `/ville/paris/daily-bread/bucket/${bucketKey}/${encodeURIComponent(
    decodedL2,
  )}/${encodeURIComponent(decodedL3)}`;

  return (
    <div className="theme-fusion db-drawer-shell">
      <DetailDrawer
        kicker={eyebrow}
        title={entryLabel}
        shareUrl={shareUrl}
        backHref={`/ville/paris/daily-bread/bucket/${bucketKey}/${encodeURIComponent(
          decodedL2,
        )}`}
        breadcrumbLabel={entryLabel}
      >
        <DailyBreadDrilldownFiche
          bucket={found.bucket}
          bucketKey={bucketKey}
          level2={found.parent}
          level3={found.entry}
          isStub={isStub()}
        />
      </DetailDrawer>
    </div>
  );
}
