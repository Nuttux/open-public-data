import { notFound } from "next/navigation";

import DetailDrawer from "@/components/fusion/DetailDrawer";
import { ForcedLocale } from "@/lib/localeContext";
import SfPayeeFiche from "@/components/us/SfPayeeFiche";
import { loadSfPayee } from "@/lib/us/sf-payees-data";
import { fmtUsdCompact } from "@/lib/us/format";

type Params = { slug: string };

/**
 * Root-level intercepting drawer for SF payee fiches. Self-wraps in
 * ForcedLocale because the root @drawer slot renders OUTSIDE app/us/layout.tsx.
 */
export default async function DrawerSfPayeePage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const payee = loadSfPayee(slug);
  if (!payee) return notFound();

  const shareText = `${payee.name} — ${fmtUsdCompact(payee.total_paid_usd)} paid by San Francisco (${payee.first_year}–${payee.last_year}).`;

  return (
    <ForcedLocale locale="en">
      <div className="theme-fusion">
        <DetailDrawer
          kicker={<>Payee · San Francisco</>}
          title={payee.name}
          shareUrl={`/us/city/sf/who-gets-paid/payee/${slug}`}
          shareText={shareText}
          backHref="/us/city/sf/who-gets-paid"
          breadcrumbLabel={payee.name}
        >
          <SfPayeeFiche payee={payee} />
        </DetailDrawer>
      </div>
    </ForcedLocale>
  );
}
