import { notFound } from "next/navigation";

import { DetailDrawer, BudgetDrilldownFiche } from "@/components/fusion";
import {
  getBucket,
  getDeptDrilldown,
  getDeptEntry,
  getDeptLevel3Entry,
  isStub,
} from "@/lib/budget-drilldown";
import { readLocale } from "@/lib/seo";

type Params = { level2: string; level3: string };

export default async function DrawerDeptLevel3Page({
  params,
}: {
  params: Promise<Params>;
}) {
  const { level2, level3 } = await params;
  const decodedL2 = decodeURIComponent(level2);
  const decodedL3 = decodeURIComponent(level3);
  const bucket = getBucket("local");
  const block = getDeptDrilldown();
  const parent = getDeptEntry(decodedL2);
  const entry = getDeptLevel3Entry(decodedL2, decodedL3);
  if (!bucket || !block || !parent || !entry) return notFound();

  const locale = await readLocale();
  const bucketLabel = locale === "en" ? bucket.label_en : bucket.label_fr;
  const blockLabel = locale === "en" ? block.label_en : block.label_fr;
  const parentLabel = locale === "en" ? parent.label_en : parent.label_fr;
  const entryLabel = locale === "en" ? entry.label_en : entry.label_fr;
  const eyebrow = `${bucketLabel} · ${blockLabel} · ${parentLabel}`;

  const shareUrl = `/ville/paris/daily-bread/bucket/local/dept/${encodeURIComponent(
    decodedL2,
  )}/${encodeURIComponent(decodedL3)}`;

  return (
    <div className="theme-fusion db-drawer-shell">
      <DetailDrawer
        kicker={eyebrow}
        title={entryLabel}
        shareUrl={shareUrl}
        backHref={`/ville/paris/daily-bread/bucket/local/dept/${encodeURIComponent(
          decodedL2,
        )}`}
        breadcrumbLabel={entryLabel}
      >
        <BudgetDrilldownFiche
          bucket={bucket}
          bucketKey="local"
          scope="dept"
          scopeBlock={block}
          level2={parent}
          level3={entry}
          isStub={isStub()}
        />
      </DetailDrawer>
    </div>
  );
}
